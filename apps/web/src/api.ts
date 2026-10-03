export type Unit = string;

export interface Member { id: string; name: string; eatsByDefault: boolean; constraints: { kind: string; strictness: string; itemId?: string }[] }
export interface Item { id: string; name: string; category: string; allergens: string[]; isStaple: boolean; defaultUnit: Unit }
export type Slot = 'breakfast' | 'lunch' | 'dinner';
export interface Plan { id: string; recipeId: string; servings: number; day: string | null; date: string | null; slot: Slot; eaterIds: string[]; status: string }
export interface RecipeSummary { id: string; name: string; servings: number; source: { type: string; ref?: string } }
export interface ListItem { id: string; text: string; itemId: string | null; qty: number | null; addedVia: string; status: string }
export interface RetailerInfo { id: string; name: string; modes: string[]; session: { connected: boolean; expiresAt?: string; note?: string } }
export interface State { members: Member[]; items: Item[]; plans: Plan[]; recipes: RecipeSummary[]; list: ListItem[]; retailers: RetailerInfo[]; household: { defaultServings: number; ownBrandOk: boolean; alwaysAskCategories: string[] }; meMemberId: string | null; llm: boolean }

export interface Product { retailer: string; id: string; name: string; price: number; packQty: number; packUnit: Unit; packCount?: number; dietary: string[]; allergens: string[]; mayContain: string[]; ownBrand?: boolean; brand?: string }
export interface Ranked { product: Product; plan: { packs: number; totalQty: number; unit: Unit; overshoot: number }; lineTotal: number; score: number; dietary: { kind: string; allergen?: string; blocks?: boolean }; blocked: boolean; reasons: string[] }
export interface OrderLine { key: string; section: 'recipe' | 'extras'; itemId: string | null; itemName: string; needQty: number; needUnit: Unit; needLabel: string; haveLabel: string | null; anyApprox: boolean; forRecipes: string[]; chosen: Ranked | null; alternatives: Ranked[]; qty: number; lineTotal: number; haveIt: boolean; removed: boolean; blocked: boolean; blockReason: string | null; note: string | null }
export interface Draft { retailer: string; retailerName: string; eaters: string[]; constraintsSummary: string[]; lines: OrderLine[]; subtotal: number; deliveryFee: number; minimumOrder: number; meetsMinimum: boolean; total: number; blockers: number; handoffList: string; planIds: string[] }
export interface Order { id: string; status: string; draft: Draft }

export interface PreviewLine { raw: string; itemId: string | null; itemName: string; qty: number | null; unit: Unit | null; prep?: string; scaling: string; optional?: boolean; swappedFrom?: string; swapReason?: string; label: string; staple: boolean; haveQty: number; haveApprox: boolean; haveUnit: Unit | null }
export interface Preview { recipe: { id: string; name: string; servings: number; steps: string[]; source: { type: string } }; servings: number; constraints: { allergen: string; strictness: string }[]; lines: PreviewLine[] }

export interface StockRow { id: string; itemId: string; qty: number; unit: Unit; confidence: 'exact' | 'approx'; location: string; freeFrom: string[]; boughtAt?: string; expiresAt?: string; note?: string; item: Item | null }

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any).error ?? res.statusText), { status: res.status, data });
  return data as T;
}

export const api = {
  state: () => call<State>('GET', '/api/state'),
  ask: (text: string) => call<{ intents: unknown[]; results: any[] }>('POST', '/api/ask', { text }),
  preview: (id: string, servings: number, eaterIds: string[]) => call<Preview>('POST', `/api/recipes/${id}/preview`, { servings, eaterIds }),
  addPlan: (recipeId: string, servings: number, day: string | null, eaterIds: string[], date?: string | null, slot?: Slot) => call<Plan>('POST', '/api/plans', { recipeId, servings, day, eaterIds, ...(date !== undefined ? { date } : {}), ...(slot ? { slot } : {}) }),
  patchPlan: (id: string, change: Partial<Pick<Plan, 'servings' | 'date' | 'slot' | 'eaterIds'>>) => call<Plan>('PATCH', `/api/plans/${id}`, change),
  week: (weeks = 2) => call<{ start: string; end: string; plans: Plan[]; unscheduled: Plan[] }>('GET', `/api/plans/week?weeks=${weeks}`),
  deletePlan: (id: string) => call('DELETE', `/api/plans/${id}`),
  cooked: (id: string) => call('POST', `/api/plans/${id}/cooked`, {}),
  propose: () => call<Order & { id: string }>('POST', '/api/orders/propose', {}),
  order: (id: string) => call<Order>('GET', `/api/orders/${id}`),
  orders: () => call<{ id: string; status: string; createdAt: string; total: number }[]>('GET', '/api/orders'),
  patchLine: (id: string, key: string, change: Record<string, unknown>) => call<Order>('PATCH', `/api/orders/${id}/lines/${encodeURIComponent(key)}`, change),
  approve: (id: string, override = false) => call<{ ok: boolean; pushed: number; basketUrl: string; notPushed: string[] }>('POST', `/api/orders/${id}/approve`, { override }),
  delivered: (id: string) => call('POST', `/api/orders/${id}/delivered`, {}),
  inventory: () => call<StockRow[]>('GET', '/api/inventory'),
  addStock: (text: string) => call<StockRow>('POST', '/api/inventory', { text }),
  patchStock: (id: string, change: Record<string, unknown>) => call('PATCH', `/api/inventory/${id}`, change),
  deleteStock: (id: string) => call('DELETE', `/api/inventory/${id}`),
  syncOrders: (retailerId: string) => call<{ added: unknown[] }>('POST', `/api/retailers/${retailerId}/sync-orders`, {}),
  list: () => call<ListItem[]>('GET', '/api/list'),
  addList: (text: string) => call<ListItem>('POST', '/api/list', { text }),
  deleteList: (id: string) => call('DELETE', `/api/list/${id}`),
  saveMember: (m: Member) => call<Member>('PUT', `/api/household/members/${m.id}`, { name: m.name, eatsByDefault: m.eatsByDefault, constraints: m.constraints }),
  deleteMember: (id: string) => call('DELETE', `/api/household/members/${id}`),
  saveSettings: (s: State['household']) => call('PUT', '/api/household/settings', s),
};

export const gbp = (n: number) => `£${n.toFixed(2)}`;

/** Fired after chat or any screen changes data, so other mounted screens reload. */
export const CHANGED = 'foododer:changed';
export const notifyChanged = () => window.dispatchEvent(new CustomEvent(CHANGED));

export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d! + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function dayName(iso: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', { weekday: style });
}
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
