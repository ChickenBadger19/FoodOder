import type { Item } from '@foodify/core';
import CATALOGUE from './catalogue.json' with { type: 'json' };
import ALIASES from './aliases.json' with { type: 'json' };

/** Catalogue items beyond the hand-written seed set; generated to cover the recipe library. */
export const CATALOGUE_EXTRA: Item[] = CATALOGUE as Item[];

/** Extra aliases for hand-written items, keyed by item id. */
export const EXTRA_ALIASES: Record<string, string[]> = ALIASES as Record<string, string[]>;
