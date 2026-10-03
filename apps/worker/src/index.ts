import { createApp, prepareStore, basicAuthFromEnv, Store, type SqlDriver } from '@foodify/app';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  /** "1" seeds the demo household on first run; anything else seeds the catalogue only. */
  FOODIFY_DEMO?: string;
  /** HTTP Basic auth over the whole app: username and hex SHA-256 of "user:password". */
  BASIC_AUTH_USER?: string;
  BASIC_AUTH_SHA256?: string;
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
    async batch(stmts) {
      // One round trip for the whole seed; also keeps us well under the per-request subrequest limit.
      for (let i = 0; i < stmts.length; i += 100) {
        await db.batch(stmts.slice(i, i + 100).map(s => db.prepare(s.sql).bind(...s.params)));
      }
    },
  };
}

/** One app per isolate; tables are created and seeded once per isolate (idempotent). */
let ready: Promise<ReturnType<typeof createApp>> | undefined;
function appFor(env: Env) {
  if (!ready) {
    ready = (async () => {
      const store = new Store(d1Driver(env.DB));
      await prepareStore(store, { demo: env.FOODIFY_DEMO === '1' });
      const app = createApp({ store, anthropicApiKey: env.ANTHROPIC_API_KEY, auth: basicAuthFromEnv(env) });
      // Static files (the PWA) are served here, after the auth guard, instead of by the assets layer directly.
      app.get('*', c => env.ASSETS.fetch(c.req.raw));
      return app;
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
