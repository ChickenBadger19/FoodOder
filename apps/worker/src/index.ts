import { createApp, prepareStore, Store, type SqlDriver } from '@foododer/app';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  /** "1" seeds the demo household on first run; anything else seeds the catalogue only. */
  FOODODER_DEMO?: string;
}

/** Cloudflare D1 behind the async SqlDriver interface the shared Store expects. */
function d1Driver(db: D1Database): SqlDriver {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const { results } = await db.prepare(sql).bind(...params).all<T>();
      return results;
    },
    async run(sql: string, params: unknown[] = []) { await db.prepare(sql).bind(...params).run(); },
    async exec(sql: string) {
      // D1's batch is atomic; the schema is one statement per line.
      const stmts = sql.split('\n').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s));
      await db.batch(stmts);
    },
  };
}

/** One app per isolate; tables are created and seeded once per isolate (idempotent). */
let ready: Promise<ReturnType<typeof createApp>> | undefined;
function appFor(env: Env) {
  if (!ready) {
    ready = (async () => {
      const store = new Store(d1Driver(env.DB));
      await prepareStore(store, { demo: env.FOODODER_DEMO === '1' });
      return createApp({ store, anthropicApiKey: env.ANTHROPIC_API_KEY });
    })();
    ready.catch(() => { ready = undefined; });
  }
  return ready;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await appFor(env);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
