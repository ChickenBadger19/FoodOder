import type { RetailerId } from './index.js';

/**
 * Where each UK retailer lets a shopper paste a list, and the public URL shapes we can deep-link to.
 * Verified against public help pages and third-party guides (Oct 2026); retailers change these without notice.
 */
export const HANDOFF_NOTES: Record<Exclude<RetailerId, 'mock'>, { multiSearch: string; search: (q: string) => string; product?: (id: string) => string }> = {
  tesco: {
    multiSearch: 'Tesco groceries: use the "Search with a list" / multi-search box and paste one item per line.',
    search: q => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`,
    product: id => `https://www.tesco.com/groceries/en-GB/products/${encodeURIComponent(id)}`,
  },
  sainsburys: {
    multiSearch: "Sainsbury's: open the search bar and choose multi-search, then paste one item per line.",
    search: q => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}`,
  },
  ocado: {
    multiSearch: 'Ocado: use multi-search from the search bar and paste one item per line.',
    search: q => `https://www.ocado.com/search?q=${encodeURIComponent(q)}`,
  },
  asda: {
    multiSearch: 'Asda: add items to a Shopping List in the app, then "add list to trolley".',
    search: q => `https://www.asda.com/groceries/search/${encodeURIComponent(q)}`,
  },
  morrisons: {
    multiSearch: 'Morrisons: Shopping Lists in the main navigation; add each line, then add to basket.',
    search: q => `https://groceries.morrisons.com/search?q=${encodeURIComponent(q)}`,
  },
  waitrose: {
    multiSearch: 'Waitrose: choose "Multi-search" in the search bar and paste one item per line.',
    search: q => `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(q)}`,
  },
};

/** Plain-text list for pasting into a retailer's multi-search box. */
export function renderHandoffList(lines: { name: string; qty?: number; unitLabel?: string }[]): string {
  return lines.map(l => {
    const q = l.qty && l.qty > 1 ? `${l.qty} x ` : '';
    return `${q}${l.name}${l.unitLabel ? ` (${l.unitLabel})` : ''}`;
  }).join('\n');
}
