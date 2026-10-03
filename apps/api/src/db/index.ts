import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Item, Member, ProductPreference, Recipe, StockItem, Substitution } from '@foododer/core';

export interface ListItem { id: string; text: string; itemId: string | null; qty: number | null; addedVia: 'chat' | 'manual' | 'low_stock' | 'out_of'; status: 'open' | 'ordered' | 'done'; createdAt: string; }
export interface Plan { id: string; recipeId: string; servings: number; day: string | null; eaterIds: string[]; status: 'planned' | 'cooked' | 'cancelled'; createdAt: string; }
export interface InventoryEvent { id: string; stockId: string | null; itemId: string; delta: number; unit: string; reason: string; at: string; }
export interface OrderRecord { id: string; retailer: string; status: 'draft' | 'approved' | 'pushed' | 'ordered' | 'delivered'; payload: unknown; createdAt: string; approvedAt: string | null; }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS substitutions (item_id TEXT, allergen TEXT, substitute_item_id TEXT, PRIMARY KEY (item_id, allergen));
CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stock (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS list_items (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prefs (item_id TEXT, retailer TEXT, product_id TEXT, always_ask INTEGER, PRIMARY KEY (item_id, retailer));
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, retailer TEXT, status TEXT, json TEXT NOT NULL, created_at TEXT, approved_at TEXT);
CREATE TABLE IF NOT EXISTS inventory_events (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, json TEXT NOT NULL);
`;

export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export class Store {
  readonly db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  // --- generic helpers
  private all<T>(sql: string, ...args: unknown[]): T[] {
    return this.db.prepare(sql).all(...args).map((r: any) => JSON.parse(r.json) as T);
  }

  // --- items
  items(): Item[] { return this.all<Item>('SELECT json FROM items'); }
  item(id: string): Item | undefined { return this.items().find(i => i.id === id); }
  upsertItem(item: Item) { this.db.prepare('INSERT OR REPLACE INTO items (id, json) VALUES (?, ?)').run(item.id, JSON.stringify(item)); }

  substitutions(): Substitution[] {
    return this.db.prepare('SELECT item_id, allergen, substitute_item_id FROM substitutions').all().map((r: any) => ({ itemId: r.item_id, allergen: r.allergen, substituteItemId: r.substitute_item_id }));
  }
  upsertSubstitution(s: Substitution) { this.db.prepare('INSERT OR REPLACE INTO substitutions VALUES (?, ?, ?)').run(s.itemId, s.allergen, s.substituteItemId); }

  // --- recipes
  recipes(): Recipe[] { return this.all<Recipe>('SELECT json FROM recipes ORDER BY name'); }
  recipe(id: string): Recipe | undefined { const r = this.db.prepare('SELECT json FROM recipes WHERE id = ?').get(id) as any; return r ? JSON.parse(r.json) : undefined; }
  upsertRecipe(r: Recipe) { this.db.prepare('INSERT OR REPLACE INTO recipes (id, name, json) VALUES (?, ?, ?)').run(r.id, r.name, JSON.stringify(r)); }

  // --- members
  members(): Member[] { return this.all<Member>('SELECT json FROM members'); }
  upsertMember(m: Member) { this.db.prepare('INSERT OR REPLACE INTO members (id, json) VALUES (?, ?)').run(m.id, JSON.stringify(m)); }
  deleteMember(id: string) { this.db.prepare('DELETE FROM members WHERE id = ?').run(id); }

  // --- stock
  stock(): StockItem[] { return this.all<StockItem>('SELECT json FROM stock'); }
  upsertStock(s: StockItem) { this.db.prepare('INSERT OR REPLACE INTO stock (id, item_id, json) VALUES (?, ?, ?)').run(s.id, s.itemId, JSON.stringify(s)); }
  deleteStock(id: string) { this.db.prepare('DELETE FROM stock WHERE id = ?').run(id); }
  replaceStock(all: StockItem[]) {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM stock').run();
      for (const s of all) this.upsertStock(s);
    });
    tx();
  }

  // --- running list
  listItems(): ListItem[] { return this.all<ListItem>('SELECT json FROM list_items'); }
  upsertListItem(l: ListItem) { this.db.prepare('INSERT OR REPLACE INTO list_items (id, json) VALUES (?, ?)').run(l.id, JSON.stringify(l)); }
  deleteListItem(id: string) { this.db.prepare('DELETE FROM list_items WHERE id = ?').run(id); }

  // --- plans
  plans(): Plan[] { return this.all<Plan>('SELECT json FROM plans'); }
  plan(id: string): Plan | undefined { return this.plans().find(p => p.id === id); }
  upsertPlan(p: Plan) { this.db.prepare('INSERT OR REPLACE INTO plans (id, json) VALUES (?, ?)').run(p.id, JSON.stringify(p)); }
  deletePlan(id: string) { this.db.prepare('DELETE FROM plans WHERE id = ?').run(id); }

  // --- product preferences
  prefs(): ProductPreference[] {
    return this.db.prepare('SELECT * FROM prefs').all().map((r: any) => ({ itemId: r.item_id, retailer: r.retailer, productId: r.product_id, alwaysAsk: !!r.always_ask }));
  }
  upsertPref(p: ProductPreference) { this.db.prepare('INSERT OR REPLACE INTO prefs VALUES (?, ?, ?, ?)').run(p.itemId, p.retailer, p.productId, p.alwaysAsk ? 1 : 0); }

  // --- orders
  orders(): OrderRecord[] {
    return this.db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all().map((r: any) => ({ id: r.id, retailer: r.retailer, status: r.status, payload: JSON.parse(r.json), createdAt: r.created_at, approvedAt: r.approved_at }));
  }
  order(id: string): OrderRecord | undefined { return this.orders().find(o => o.id === id); }
  upsertOrder(o: OrderRecord) {
    this.db.prepare('INSERT OR REPLACE INTO orders (id, retailer, status, json, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(o.id, o.retailer, o.status, JSON.stringify(o.payload), o.createdAt, o.approvedAt);
  }

  // --- events
  addEvent(e: InventoryEvent) { this.db.prepare('INSERT INTO inventory_events (id, json) VALUES (?, ?)').run(e.id, JSON.stringify(e)); }
  events(): InventoryEvent[] { return this.all<InventoryEvent>('SELECT json FROM inventory_events'); }

  // --- settings
  setting<T>(key: string, fallback: T): T { const r = this.db.prepare('SELECT json FROM settings WHERE key = ?').get(key) as any; return r ? JSON.parse(r.json) : fallback; }
  setSetting(key: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(key, JSON.stringify(value)); }

  isEmpty(): boolean { return (this.db.prepare('SELECT COUNT(*) AS n FROM items').get() as any).n === 0; }
}
