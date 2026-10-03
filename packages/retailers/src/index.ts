import type { Product } from '@foododer/core';

export type RetailerId = 'tesco' | 'sainsburys' | 'ocado' | 'asda' | 'morrisons' | 'waitrose' | 'mock';

/**
 * How a retailer can receive a basket. Ordered from least to most capable; also least to most fragile.
 *  - 'list':    we produce a text list the user pastes into the retailer's multi-search page.
 *  - 'links':   we produce per-product deep links (search or product pages).
 *  - 'session': we add to the user's live basket using their own session (unofficial; needs a connector).
 *  - 'partner': an official retailer or intermediary API (none exist for UK grocers today).
 */
export type HandoffMode = 'list' | 'links' | 'session' | 'partner';

export interface BasketLine { productId: string; qty: number; }

export interface SessionStatus {
  connected: boolean;
  expiresAt?: string;
  note?: string;
}

export interface Retailer {
  id: RetailerId;
  displayName: string;
  /** Capabilities this adapter actually implements. */
  modes: HandoffMode[];
  deliveryFee: number;
  minimumOrder: number;
  search(query: string, limit?: number): Promise<Product[]>;
  product(id: string): Promise<Product | null>;
  session(): Promise<SessionStatus>;
  /** Add lines to the user's live basket. Only for 'session' or 'partner' modes. */
  basketAdd(lines: BasketLine[]): Promise<{ added: number; basketUrl: string }>;
  /** Past orders, for bootstrapping inventory. */
  orders(): Promise<{ id: string; placedAt: string; lines: { product: Product; qty: number }[] }[]>;
  /** Public URL to search this retailer for a term. */
  searchUrl(query: string): string;
  productUrl(id: string): string;
}

export { MockRetailer } from './mock.js';
export { renderHandoffList, HANDOFF_NOTES } from './handoff.js';
