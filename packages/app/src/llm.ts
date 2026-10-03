import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { parseIngredient, resolveLines, type Item, type Recipe } from '@foododer/core';

const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'count', 'sheet', 'clove', 'slice', 'tin', 'pack', 'bunch', 'handful', 'pinch'] as const;

const RecipeSchema = z.object({
  name: z.string(),
  servings: z.number().int().min(1).max(24),
  ingredients: z.array(z.object({
    text: z.string().describe('The ingredient line as written in a UK cookbook, e.g. "500g beef mince"'),
    qty: z.number().nullable(),
    unit: z.enum(UNITS).nullable(),
    item: z.string().describe('Plain ingredient name, UK English, singular where natural: "beef mince", "onion"'),
    prep: z.string().nullable(),
    scaling: z.enum(['linear', 'fixed', 'to_taste']),
    optional: z.boolean(),
  })),
  steps: z.array(z.string()),
});

export function llmAvailable(apiKey?: string): boolean {
  return Boolean(apiKey ?? (typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : undefined));
}

/**
 * Generate a recipe by name with Claude, in UK metric units, already honouring the household's constraints.
 * Returns null when no API key is configured so the app keeps working offline.
 */
export async function generateRecipe(query: string, servings: number, constraintNotes: string[], items: Item[], apiKey?: string): Promise<Recipe | null> {
  if (!llmAvailable(apiKey)) return null;
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const constraints = constraintNotes.length ? `Dietary requirements that MUST be honoured: ${constraintNotes.join('; ')}.` : 'No dietary constraints.';
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: 'You write home-cook recipes for a UK household. Use metric units and UK ingredient names (coriander, aubergine, mince). Quantities must be purchasable in a UK supermarket. Mark seasoning as to_taste, things like a bay leaf or a stock cube as fixed, everything else linear.',
    messages: [{ role: 'user', content: `Write a recipe for "${query}" that serves ${servings}. ${constraints}` }],
    output_config: { format: zodOutputFormat(RecipeSchema) },
  });
  if (response.stop_reason === 'refusal') return null;
  const out = response.parsed_output;
  if (!out) return null;
  const lines = out.ingredients.map(i => {
    const parsed = parseIngredient(i.text);
    return {
      raw: i.text,
      itemId: null,
      itemName: i.item || parsed.itemName,
      qty: i.qty ?? parsed.qty,
      unit: i.unit ?? parsed.unit,
      prep: i.prep ?? parsed.prep,
      scaling: i.scaling,
      optional: i.optional,
    };
  });
  const id = 'llm-' + query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { id, name: out.name, servings: out.servings, source: { type: 'llm', ref: 'claude-opus-5-5' }, ingredients: resolveLines(lines, items), steps: out.steps };
}
