import type { Product } from '@foododer/core';
import type { BasketLine, Retailer, SessionStatus } from './index.js';

type P = Omit<Product, 'retailer'>;

/**
 * A fixture catalogue modelled on real UK supermarket product cards, including the awkward cases:
 * free-from claims, "may contain" warnings, multipacks, and an ingredient with no verified GF option.
 */
const CATALOGUE: P[] = [
  // Meat
  { id: 'm1', name: 'Beef Mince 5% Fat 500g', price: 3.50, packQty: 500, packUnit: 'g', dietary: [], allergens: ['meat'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'm2', name: 'Beef Mince 20% Fat 750g', price: 3.95, packQty: 750, packUnit: 'g', dietary: [], allergens: ['meat'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'm3', name: 'Finest Aberdeen Angus Beef Mince 500g', price: 5.25, packQty: 500, packUnit: 'g', dietary: [], allergens: ['meat'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'm4', name: 'British Chicken Thigh Fillets 1kg', price: 6.50, packQty: 1000, packUnit: 'g', dietary: [], allergens: ['meat'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'm5', name: 'British Chicken Breast Fillets 650g', price: 5.00, packQty: 650, packUnit: 'g', dietary: [], allergens: ['meat'], mayContain: [], inStock: true, ownBrand: true },
  // Pasta
  { id: 'p1', name: 'Lasagne Sheets 500g', price: 1.10, packQty: 500, packUnit: 'g', dietary: ['vegetarian'], allergens: ['gluten'], mayContain: ['egg'], inStock: true, ownBrand: true },
  { id: 'p2', name: 'Free From Lasagne Sheets 250g', price: 2.25, packQty: 250, packUnit: 'g', dietary: ['gluten_free', 'vegetarian'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'p3', name: 'Penne Pasta 500g', price: 0.75, packQty: 500, packUnit: 'g', dietary: ['vegan'], allergens: ['gluten'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'p4', name: 'Free From Fusilli 500g', price: 1.60, packQty: 500, packUnit: 'g', dietary: ['gluten_free', 'vegan'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  // Tinned / jars
  { id: 't1', name: 'Chopped Tomatoes 400g', price: 0.50, packQty: 400, packUnit: 'g', dietary: ['vegan'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 't2', name: 'Chopped Tomatoes 4 x 400g', price: 1.85, packQty: 400, packUnit: 'g', packCount: 4, dietary: ['vegan'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 't3', name: 'Coconut Milk 400ml', price: 1.00, packQty: 400, packUnit: 'ml', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 't4', name: 'Thai Green Curry Paste 180g', price: 1.75, packQty: 180, packUnit: 'g', dietary: ['gluten_free'], allergens: ['shellfish', 'fish'], mayContain: [], inStock: true, brand: 'Blue Dragon' },
  { id: 't5', name: 'Baked Beans in Tomato Sauce 4 x 415g', price: 2.50, packQty: 415, packUnit: 'g', packCount: 4, dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, brand: 'Heinz' },
  { id: 't6', name: 'Tomato Puree 200g', price: 0.55, packQty: 200, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  // Stock: intentionally no verified GF beef stock cube in this catalogue
  { id: 's1', name: 'Beef Stock Cubes 12 Pack', price: 1.50, packQty: 12, packUnit: 'count', dietary: [], allergens: [], mayContain: ['gluten'], inStock: true, brand: 'Oxo' },
  { id: 's2', name: 'Beef Stock Cubes 10 Pack', price: 0.60, packQty: 10, packUnit: 'count', dietary: [], allergens: ['gluten'], mayContain: [], inStock: true, ownBrand: true },
  { id: 's3', name: 'Free From Chicken Stock Cubes 8 Pack', price: 1.20, packQty: 8, packUnit: 'count', dietary: ['gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  // Dairy
  { id: 'd1', name: 'British Whole Milk 2 Pints', price: 1.25, packQty: 1136, packUnit: 'ml', dietary: ['vegetarian', 'gluten_free'], allergens: ['dairy'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'd2', name: 'British Whole Milk 4 Pints', price: 1.65, packQty: 2272, packUnit: 'ml', dietary: ['vegetarian', 'gluten_free'], allergens: ['dairy'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'd3', name: 'Mature Cheddar 400g', price: 3.25, packQty: 400, packUnit: 'g', dietary: ['vegetarian', 'gluten_free'], allergens: ['dairy'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'd4', name: 'Salted Butter 250g', price: 2.10, packQty: 250, packUnit: 'g', dietary: ['vegetarian', 'gluten_free'], allergens: ['dairy'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'd5', name: 'Parmesan Wedge 200g', price: 2.75, packQty: 200, packUnit: 'g', dietary: ['gluten_free'], allergens: ['dairy'], mayContain: [], inStock: true, ownBrand: true },
  // Veg
  { id: 'v1', name: 'Brown Onions 1kg', price: 0.95, packQty: 1000, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v2', name: 'Brown Onions Loose', price: 0.18, packQty: 1, packUnit: 'count', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v3', name: 'Garlic Bulb Loose', price: 0.35, packQty: 1, packUnit: 'count', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v4', name: 'Baking Potatoes 4 Pack', price: 1.20, packQty: 4, packUnit: 'count', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v5', name: 'Limes 5 Pack', price: 0.90, packQty: 5, packUnit: 'count', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v6', name: 'Carrots 1kg', price: 0.60, packQty: 1000, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v7', name: 'Celery', price: 0.75, packQty: 1, packUnit: 'count', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v8', name: 'Green Beans 220g', price: 1.00, packQty: 220, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v9', name: 'Fresh Coriander 30g', price: 0.60, packQty: 30, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'v10', name: 'Fresh Basil 30g', price: 0.60, packQty: 30, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  // Dry goods
  { id: 'g1', name: 'Basmati Rice 2kg', price: 3.25, packQty: 2000, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'g2', name: 'Plain Flour 1.5kg', price: 0.85, packQty: 1500, packUnit: 'g', dietary: ['vegan'], allergens: ['gluten'], mayContain: [], inStock: true, ownBrand: true },
  { id: 'g3', name: 'Free From Plain Flour 1kg', price: 1.75, packQty: 1000, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'g4', name: 'Olive Oil 1L', price: 6.50, packQty: 1000, packUnit: 'ml', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'g5', name: 'Fish Sauce 150ml', price: 1.40, packQty: 150, packUnit: 'ml', dietary: ['gluten_free'], allergens: ['fish'], mayContain: [], inStock: true, brand: 'Blue Dragon' },
  { id: 'g6', name: 'Soft Brown Sugar 500g', price: 1.10, packQty: 500, packUnit: 'g', dietary: ['vegan', 'gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  // Household
  { id: 'h1', name: 'Domestos Original Bleach 750ml', price: 1.50, packQty: 750, packUnit: 'ml', dietary: [], allergens: [], mayContain: [], inStock: true, brand: 'Domestos' },
  { id: 'h2', name: 'Thick Bleach Original 2L', price: 1.00, packQty: 2000, packUnit: 'ml', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h3', name: 'Bin Liners 50L 20 Pack', price: 2.00, packQty: 20, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h4', name: 'Toilet Tissue 9 Rolls', price: 4.50, packQty: 9, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h5', name: 'Washing Up Liquid 500ml', price: 1.25, packQty: 500, packUnit: 'ml', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h6', name: 'Freezer Bags Small 60 Pack', price: 1.00, packQty: 60, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h7', name: 'Freezer Bags Medium 40 Pack', price: 1.20, packQty: 40, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h8', name: 'Freezer Bags Large 25 Pack', price: 1.40, packQty: 25, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h9', name: 'Kitchen Roll 2 Pack', price: 1.75, packQty: 2, packUnit: 'count', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h10', name: 'Dishwasher Salt 2kg', price: 1.10, packQty: 2000, packUnit: 'g', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
  { id: 'h11', name: 'All Purpose Cleaner Spray 750ml', price: 1.30, packQty: 750, packUnit: 'ml', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true },
];

export class MockRetailer implements Retailer {
  id = 'mock' as const;
  displayName: string;
  modes: Retailer['modes'] = ['list', 'links', 'session'];
  deliveryFee = 3.0;
  minimumOrder = 40;
  private basket: BasketLine[] = [];
  private pastOrders: { id: string; placedAt: string; lines: { product: Product; qty: number }[] }[] = [];

  constructor(displayName = 'Mock Supermarket', private readonly catalogue: P[] = CATALOGUE) {
    this.displayName = displayName;
    // A plausible order history to bootstrap inventory from.
    this.pastOrders = [{
      id: 'ord-1', placedAt: '2026-09-21T10:00:00Z',
      lines: [
        { product: this.wrap(this.catalogue.find(p => p.id === 't2')!), qty: 1 },
        { product: this.wrap(this.catalogue.find(p => p.id === 'd3')!), qty: 1 },
        { product: this.wrap(this.catalogue.find(p => p.id === 'm1')!), qty: 1 },
        { product: this.wrap(this.catalogue.find(p => p.id === 'g1')!), qty: 1 },
      ],
    }];
  }

  private wrap(p: P): Product { return { ...p, retailer: this.id }; }

  async search(query: string, limit = 8): Promise<Product[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = this.catalogue
      .map(p => ({ p, hits: words.filter(w => p.name.toLowerCase().includes(w)).length }))
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.p.price - b.p.price)
      .slice(0, limit);
    return scored.map(x => this.wrap(x.p));
  }

  async product(id: string): Promise<Product | null> {
    const p = this.catalogue.find(x => x.id === id);
    return p ? this.wrap(p) : null;
  }

  async session(): Promise<SessionStatus> {
    return { connected: true, expiresAt: new Date(Date.now() + 5 * 864e5).toISOString(), note: 'Mock retailer: always connected.' };
  }

  async basketAdd(lines: BasketLine[]): Promise<{ added: number; basketUrl: string }> {
    for (const l of lines) {
      const existing = this.basket.find(b => b.productId === l.productId);
      if (existing) existing.qty += l.qty; else this.basket.push({ ...l });
    }
    return { added: lines.length, basketUrl: 'https://example.invalid/mock-basket' };
  }

  async orders() { return this.pastOrders; }

  basketContents(): BasketLine[] { return this.basket; }

  searchUrl(query: string): string { return `https://example.invalid/search?q=${encodeURIComponent(query)}`; }
  productUrl(id: string): string { return `https://example.invalid/products/${id}`; }
}
