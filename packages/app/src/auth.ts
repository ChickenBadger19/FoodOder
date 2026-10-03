import type { MiddlewareHandler } from 'hono';
import { basicAuth } from 'hono/basic-auth';

export interface BasicAuthConfig {
  user: string;
  /** Hex SHA-256 of "user:password". The password itself is never stored. */
  sha256: string;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Paths that stay open so deploy checks and uptime monitors work without credentials. */
export const OPEN_PATHS = new Set(['/api/health']);

/**
 * HTTP Basic auth over the whole app (PWA and API) when configured. Credentials are checked against a
 * hash so the config can live in version control without the password.
 */
export function basicAuthGuard(cfg: BasicAuthConfig): MiddlewareHandler {
  const check = basicAuth({
    realm: 'Foodify',
    verifyUser: async (username, password) => username === cfg.user && (await sha256Hex(`${username}:${password}`)) === cfg.sha256.toLowerCase(),
  });
  return async (c, next) => (OPEN_PATHS.has(c.req.path) ? next() : check(c, next));
}

/** Read the guard's config from host environment variables, if both are set. */
export function basicAuthFromEnv(env: { BASIC_AUTH_USER?: string; BASIC_AUTH_SHA256?: string }): BasicAuthConfig | undefined {
  const user = env.BASIC_AUTH_USER;
  const sha256 = env.BASIC_AUTH_SHA256;
  return user && sha256 ? { user, sha256 } : undefined;
}
