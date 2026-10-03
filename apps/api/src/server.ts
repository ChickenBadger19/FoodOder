import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { createApp, prepareStore, Store, type SqlDriver } from '@foododer/app';
import type { Retailer } from '@foododer/retailers';

const DB_FILE = process.env.FOODODER_DB ?? 'data/foododer.sqlite';
const PORT = Number(process.env.PORT ?? 8787);

/** better-sqlite3 behind the async SqlDriver interface the shared Store expects. */
export function sqliteDriver(file: string): SqlDriver & { close(): void } {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  return {
    async all<T>(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params) as T[]; },
    async run(sql: string, params: unknown[] = []) { db.prepare(sql).run(...params); },
    async exec(sql: string) { db.exec(sql); },
    close() { db.close(); },
  };
}

export interface BuildOptions { dbFile?: string; retailer?: Retailer; demo?: boolean; webDist?: string }

/** The API plus, when a built PWA is present, the static files with an SPA fallback for non-API routes. */
export async function buildApp(opts: BuildOptions = {}) {
  const driver = sqliteDriver(opts.dbFile ?? DB_FILE);
  const store = new Store(driver);
  await prepareStore(store, { demo: opts.demo ?? process.env.FOODODER_DEMO === '1' });
  const api = createApp({ store, retailer: opts.retailer, anthropicApiKey: process.env.ANTHROPIC_API_KEY });

  const app = new Hono();
  app.route('/', api);

  const webDist = opts.webDist ?? path.resolve(process.cwd(), '../web/dist');
  if (fs.existsSync(webDist)) {
    const root = path.relative(process.cwd(), webDist) || '.';
    app.use('/*', serveStatic({ root }));
    app.get('/*', (c) => {
      if (c.req.path.startsWith('/api')) return c.json({ error: 'not found' }, 404);
      return c.html(fs.readFileSync(path.join(webDist, 'index.html'), 'utf8'));
    });
  }

  return { app, store, close: () => driver.close() };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const { app } = await buildApp();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`FoodOder API listening on http://localhost:${info.port} (db: ${DB_FILE})`);
  });
}
