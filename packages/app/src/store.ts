import type { Item, Member, ProductPreference, Recipe, StockItem, Substitution } from '@foododer/core';

/**
 * Minimal SQL driver so the same Store runs on better-sqlite3 (Node) and Cloudflare D1 (Workers).
 * Both are SQLite, so the schema and statements are identical; only the calling convention differs.
 */
export interface SqlDriver {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
  /** One or more statements, one per line. Used for the schema only. */
  exec(sql: string): Promise<void>;
  /** Run several writes in one round trip (atomically where the engine allows). Optional: falls back to sequential run(). */
  batch?(stmts: { sql: string; params: unknown[] }[]): Promise<void>;
}

export type Slot = 'breakfast' | 'lunch' | 'dinner';
export interface ListItem { id: string; text: string; itemId: string | null; qty: number | null; addedVia: 'chat' | 'manual' | 'low_stock' | 'out_of'; status: 'open' | 'ordered' | 'done'; createdAt: string; }
export interface Plan {
  id: string;
  recipeId: string;
  servings: number;
  /** Human label as spoken ("friday"), kept for display. */
  day: string | null;
  /** ISO date YYYY-MM-DD the meal is planned for, null = unscheduled. */
  date: string | null;
  slot: Slot;
  eaterIds: string[];
  status: 'planned' | 'cooked' | 'cancelled';
  createdAt: string;
}
export interface InventoryEvent { id: string; stockId: string | null; itemId: string; delta: number; unit: string; reason: string; at: string; }
export interface OrderRecord { id: string; retailer: string; status: 'draft' | 'approved' | 'pushed' | 'ordered' | 'delivered'; payload: unknown; createdAt: string; approvedAt: string | null; }

export const SCHEMA = `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS substitutions (item_id TEXT, allergen TEXT, substitute_item_id TEXT, PRIMARY KEY (item_id, allergen));
CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stock (id TEXT PRIMARY KEY, item_id TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS list_items (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prefs (item_id TEXT, retailer TEXT, product_id TEXT, always_ask INTEGER, PRIMARY KEY (item_id, retailer));
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, retailer TEXT, status TEXT, json TEXT NOT NULL, created_at TEXT, approved_at TEXT);
CREATE TABLE IF NOT EXISTS inventory_events (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, json TEXT NOT NULL);`;

export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

type JsonRow = { json: string };

export class Store {
  constructor(private readonly d: SqlDriver) {}
  private buffer: { sql: string; params: unknown[] }[] | null = null;

  /** Writes issued inside `fn` are collected and sent as one batch at the end (one D1 round trip instead of one per row). */
  async batch(fn: () => Promise<void>): Promise<void> {
    if (this.buffer) { await fn(); return; }
    this.buffer = [];
    try {
      await fn();
      const stmts = this.buffer;
      this.buffer = null;
      if (stmts.length === 0) return;
      if (this.d.batch) await this.d.batch(stmts);
      else for (const s of stmts) await this.d.run(s.sql, s.params);
    } finally { this.buffer = null; }
  }

  private run(sql: string, params: unknown[] = []): Promise<void> {
    if (this.buffer) { this.buffer.push({ sql, params }); return Promise.resolve(); }
    return this.d.run(sql, params);
  }

  /** Create tables if missing. Safe to call on every start. */
  async init(): Promise<void> { await this.d.exec(SCHEMA); }

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.d.all<JsonRow>(sql, params)).map(r => JSON.parse(r.json) as T);
  }

  // --- items
  items(): Promise<Item[]> { return this.rows<Item>('SELECT json FROM items'); }
  async item(id: string): Promise<Item | undefined> { return (await this.rows<Item>('SELECT json FROM items WHERE id = ?', [id]))[0]; }
  upsertItem(item: Item) { return this.run('INSERT OR REPLACE INTO items (id, json) VALUES (?, ?)', [item.id, JSON.stringify(item)]); }

  async substitutions(): Promise<Substitution[]> {
    const rows = await this.d.all<{ item_id: string; allergen: string; substitute_item_id: string }>('SELECT item_id, allergen, substitute_item_id FROM substitutions');
    return rows.map(r => ({ itemId: r.item_id, allergen: r.allergen as Substitution['allergen'], substituteItemId: r.substitute_item_id }));
  }
  upsertSubstitution(s: Substitution) { return this.run('INSERT OR REPLACE INTO substitutions VALUES (?, ?, ?)', [s.itemId, s.allergen, s.substituteItemId]); }

  // --- recipes
  recipes(): Promise<Recipe[]> { return this.rows<Recipe>('SELECT json FROM recipes ORDER BY name'); }
  async recipe(id: string): Promise<Recipe | undefined> { return (await this.rows<Recipe>('SELECT json FROM recipes WHERE id = ?', [id]))[0]; }
  upsertRecipe(r: Recipe) { return this.run('INSERT OR REPLACE INTO recipes (id, name, json) VALUES (?, ?, ?)', [r.id, r.name, JSON.stringify(r)]); }

  // --- members
  members(): Promise<Member[]> { return this.rows<Member>('SELECT json FROM members'); }
  upsertMember(m: Member) { return this.run('INSERT OR REPLACE INTO members (id, json) VALUES (?, ?)', [m.id, JSON.stringify(m)]); }
  deleteMember(id: string) { return this.run('DELETE FROM members WHERE id = ?', [id]); }

  // --- stock
  stock(): Promise<StockItem[]> { return this.rows<StockItem>('SELECT json FROM stock'); }
  upsertStock(s: StockItem) { return this.run('INSERT OR REPLACE INTO stock (id, item_id, json) VALUES (?, ?, ?)', [s.id, s.itemId, JSON.stringify(s)]); }
  deleteStock(id: string) { return this.run('DELETE FROM stock WHERE id = ?', [id]); }
  async replaceStock(all: StockItem[]) {
    await this.run('DELETE FROM stock');
    for (const s of all) await this.upsertStock(s);
  }

  // --- running list
  listItems(): Promise<ListItem[]> { return this.rows<ListItem>('SELECT json FROM list_items'); }
  upsertListItem(l: ListItem) { return this.run('INSERT OR REPLACE INTO list_items (id, json) VALUES (?, ?)', [l.id, JSON.stringify(l)]); }
  deleteListItem(id: string) { return this.run('DELETE FROM list_items WHERE id = ?', [id]); }

  // --- plans
  plans(): Promise<Plan[]> { return this.rows<Plan>('SELECT json FROM plans'); }
  async plan(id: string): Promise<Plan | undefined> { return (await this.rows<Plan>('SELECT json FROM plans WHERE id = ?', [id]))[0]; }
  upsertPlan(p: Plan) { return this.run('INSERT OR REPLACE INTO plans (id, json) VALUES (?, ?)', [p.id, JSON.stringify(p)]); }
  deletePlan(id: string) { return this.run('DELETE FROM plans WHERE id = ?', [id]); }

  // --- product preferences
  async prefs(): Promise<ProductPreference[]> {
    const rows = await this.d.all<{ item_id: string; retailer: string; product_id: string; always_ask: number }>('SELECT * FROM prefs');
    return rows.map(r => ({ itemId: r.item_id, retailer: r.retailer, productId: r.product_id, alwaysAsk: !!r.always_ask }));
  }
  upsertPref(p: ProductPreference) { return this.run('INSERT OR REPLACE INTO prefs VALUES (?, ?, ?, ?)', [p.itemId, p.retailer, p.productId, p.alwaysAsk ? 1 : 0]); }

  // --- orders
  async orders(): Promise<OrderRecord[]> {
    const rows = await this.d.all<{ id: string; retailer: string; status: OrderRecord['status']; json: string; created_at: string; approved_at: string | null }>('SELECT * FROM orders ORDER BY created_at DESC');
    return rows.map(r => ({ id: r.id, retailer: r.retailer, status: r.status, payload: JSON.parse(r.json), createdAt: r.created_at, approvedAt: r.approved_at }));
  }
  async order(id: string): Promise<OrderRecord | undefined> { return (await this.orders()).find(o => o.id === id); }
  upsertOrder(o: OrderRecord) {
    return this.run('INSERT OR REPLACE INTO orders (id, retailer, status, json, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?)', [o.id, o.retailer, o.status, JSON.stringify(o.payload), o.createdAt, o.approvedAt]);
  }

  // --- events
  addEvent(e: InventoryEvent) { return this.run('INSERT INTO inventory_events (id, json) VALUES (?, ?)', [e.id, JSON.stringify(e)]); }
  events(): Promise<InventoryEvent[]> { return this.rows<InventoryEvent>('SELECT json FROM inventory_events'); }

  // --- settings
  async setting<T>(key: string, fallback: T): Promise<T> {
    const r = (await this.d.all<JsonRow>('SELECT json FROM settings WHERE key = ?', [key]))[0];
    return r ? (JSON.parse(r.json) as T) : fallback;
  }
  setSetting(key: string, value: unknown) { return this.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key, JSON.stringify(value)]); }

  async isEmpty(): Promise<boolean> {
    const r = (await this.d.all<{ n: number }>('SELECT COUNT(*) AS n FROM items'))[0];
    return !r || Number(r.n) === 0;
  }
}
