import { describe, expect, it } from 'vitest';
import { parseAsk } from '../src/intent.js';

describe('parseAsk', () => {
  it('splits recipes and list items', () => {
    const intents = parseAsk('lasagne for 6 on friday, and we need bleach');
    expect(intents).toEqual([
      { kind: 'recipe', query: 'lasagne', servings: 6, day: 'friday', slot: null, only: [], except: [] },
      { kind: 'list', item: 'bleach', qty: null },
    ]);
  });

  it('handles several recipes and days', () => {
    const intents = parseAsk('Thai green curry for 4 on saturday and jacket potatoes for 2 sunday');
    expect(intents[0]).toMatchObject({ kind: 'recipe', query: 'thai green curry', servings: 4, day: 'saturday' });
    expect(intents[1]).toMatchObject({ kind: 'recipe', query: 'jacket potatoes', servings: 2, day: 'sunday' });
  });

  it('recognises out-of and stock adds', () => {
    expect(parseAsk("we're out of milk")).toEqual([{ kind: 'out_of', item: 'milk' }]);
    expect(parseAsk('we have 2 onions')).toEqual([{ kind: 'stock_add', item: 'onions', qty: 2 }]);
    expect(parseAsk('add 3 bin bags to the list')).toEqual([{ kind: 'list', item: 'bin bags', qty: 3 }]);
  });

  it('treats "need X for N" as a recipe', () => {
    expect(parseAsk('need a chilli for 4')).toMatchObject([{ kind: 'recipe', query: 'chilli', servings: 4, day: null }]);
  });

  it('parses who is eating and the meal slot', () => {
    expect(parseAsk('lasagne on friday without sam')).toMatchObject([{ kind: 'recipe', query: 'lasagne', day: 'friday', except: ['sam'] }]);
    expect(parseAsk('pancakes for breakfast on sunday just me and alex')).toMatchObject([{ kind: 'recipe', query: 'pancakes', day: 'sunday', slot: 'breakfast', only: ['me', 'alex'] }]);
    expect(parseAsk('thai green curry for 4 tuesday everyone except sam')).toMatchObject([{ kind: 'recipe', query: 'thai green curry', servings: 4, day: 'tuesday', except: ['sam'] }]);
    expect(parseAsk('soup for lunch for sam')).toMatchObject([{ kind: 'recipe', query: 'soup', slot: 'lunch', only: ['sam'] }]);
  });

  it('keeps household items out of recipe parsing', () => {
    expect(parseAsk('we need medium freezer bags')).toEqual([{ kind: 'list', item: 'medium freezer bags', qty: null }]);
    expect(parseAsk('oh we need medium freezer bags and some kitchen roll')).toEqual([
      { kind: 'list', item: 'medium freezer bags', qty: null },
      { kind: 'list', item: 'kitchen roll', qty: null },
    ]);
  });
});
