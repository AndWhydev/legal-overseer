import db from '../lib/db';

console.log('Seeding CheekyGlo products catalog...');

// Clear existing products (for re-seeding)
db.exec('DELETE FROM products');

const insertProduct = db.prepare(`
  INSERT INTO products (sku, name, category, variant, price_aud, inventory_count, low_stock_threshold, description, usage_instructions)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Glove usage instructions (from CLIENT-PACK.md)
const gloveUsageInstructions = `How to use:
1. Soak/steam skin at least 5 minutes
2. Don't apply soaps/lotions (relies on friction)
3. Wet glove and squeeze excess water so it's damp
4. Use firm, consistent strokes

Disclaimers:
- Visible peeling varies by skin type
- Freshly exfoliated skin is sensitive
- Avoid heavily fragranced products right after
- Sensitive-glove option available for very sensitive skin/conditions`;

const products = [
  // Exfoliating Gloves
  {
    sku: 'CG-GLV-OG',
    name: 'Original Exfoliating Glove',
    category: 'gloves',
    variant: 'original',
    price_aud: 24.95,
    inventory_count: 85,
    low_stock_threshold: 15,
    description: 'The original CheekyGlo exfoliating glove that started it all. Perfect for normal skin types.',
    usage_instructions: gloveUsageInstructions,
  },
  {
    sku: 'CG-GLV-SN',
    name: 'Sensitive Skin Exfoliating Glove',
    category: 'gloves',
    variant: 'sensitive',
    price_aud: 26.95,
    inventory_count: 42,
    low_stock_threshold: 10,
    description: 'Gentler exfoliation for sensitive skin types and conditions. Same great results, softer touch.',
    usage_instructions: gloveUsageInstructions,
  },
  {
    sku: 'CG-GLV-MN',
    name: 'CheekyBro Men\'s Exfoliating Glove',
    category: 'gloves',
    variant: 'mens',
    price_aud: 26.95,
    inventory_count: 28,
    low_stock_threshold: 10,
    description: 'Designed for men\'s skin. Same powerful exfoliation with a masculine design.',
    usage_instructions: gloveUsageInstructions,
  },
  {
    sku: 'CG-GLV-FC',
    name: 'Face Exfoliating Mitt',
    category: 'mitts',
    variant: null,
    price_aud: 19.95,
    inventory_count: 65,
    low_stock_threshold: 15,
    description: 'Gentle facial exfoliation mitt. Perfect for removing dead skin cells from delicate facial skin.',
    usage_instructions: `How to use:
1. Cleanse face first
2. Wet mitt with warm water
3. Use gentle, circular motions
4. Avoid eye area
5. Pat dry and apply moisturizer`,
  },
  // Body Tools
  {
    sku: 'CG-BRS-DRY',
    name: 'Dry Body Brush',
    category: 'tools',
    variant: 'dry',
    price_aud: 34.95,
    inventory_count: 12, // Low stock
    low_stock_threshold: 10,
    description: 'Premium dry brush for stimulating circulation and lymphatic drainage before shower.',
    usage_instructions: `How to use:
1. Use on dry skin before shower
2. Brush in upward strokes toward heart
3. Start at feet, work upward
4. Use gentle pressure
5. Shower after to rinse away dead skin`,
  },
  {
    sku: 'CG-BRS-WET',
    name: 'Wet Body Brush',
    category: 'tools',
    variant: 'wet',
    price_aud: 32.95,
    inventory_count: 0, // Out of stock
    low_stock_threshold: 10,
    description: 'Water-friendly body brush for use in the shower with your favorite body wash.',
    usage_instructions: `How to use:
1. Use in shower with body wash
2. Apply soap to brush or skin
3. Use circular motions
4. Rinse thoroughly after use
5. Hang to dry between uses`,
  },
  {
    sku: 'CG-SCR-BOD',
    name: 'Body Scrub (250ml)',
    category: 'tools',
    variant: null,
    price_aud: 29.95,
    inventory_count: 55,
    low_stock_threshold: 20,
    description: 'Luxurious body scrub with natural exfoliating particles. Perfect complement to gloves.',
    usage_instructions: `How to use:
1. Apply to damp skin in shower
2. Massage in circular motions
3. Focus on rough areas (elbows, knees)
4. Rinse thoroughly
5. Follow with moisturizer`,
  },
  // Bundles
  {
    sku: 'CG-BND-STR',
    name: 'Starter Bundle (Glove + Brush)',
    category: 'bundles',
    variant: null,
    price_aud: 49.95,
    inventory_count: 35,
    low_stock_threshold: 10,
    description: 'Perfect starter set: Original Exfoliating Glove + Dry Body Brush. Save $10!',
    usage_instructions: 'See individual product instructions.',
  },
  {
    sku: 'CG-BND-ULT',
    name: 'Ultimate Bundle (Glove + Both Brushes + Scrub)',
    category: 'bundles',
    variant: null,
    price_aud: 99.95,
    inventory_count: 8, // Low stock
    low_stock_threshold: 5,
    description: 'The complete CheekyGlo experience: Glove + Dry Brush + Wet Brush + Body Scrub. Save $23!',
    usage_instructions: 'See individual product instructions.',
  },
  {
    sku: 'CG-BND-GFT',
    name: 'Gift Set (2 Gloves + Bag)',
    category: 'bundles',
    variant: null,
    price_aud: 54.95,
    inventory_count: 22,
    low_stock_threshold: 10,
    description: 'Perfect gift: 2 Original Exfoliating Gloves + Travel Bag. Great for sharing or gifting!',
    usage_instructions: 'See individual product instructions.',
  },
  // Accessories
  {
    sku: 'CG-BAG-TRV',
    name: 'Travel Bag',
    category: 'accessories',
    variant: null,
    price_aud: 14.95,
    inventory_count: 120,
    low_stock_threshold: 25,
    description: 'Water-resistant travel bag for your CheekyGlo products. Perfect for gym or travel.',
    usage_instructions: null,
  },
  {
    sku: 'CG-BAG-WSH',
    name: 'Wash Bag',
    category: 'accessories',
    variant: null,
    price_aud: 12.95,
    inventory_count: 95,
    low_stock_threshold: 20,
    description: 'Mesh wash bag to protect your gloves and mitts in the washing machine.',
    usage_instructions: `Care instructions:
1. Place gloves/mitts inside bag
2. Machine wash on gentle cycle
3. Hang to dry
4. Replace gloves every 2-3 months for best results`,
  },
];

// Define product type from the array
type ProductType = typeof products[0];

// Insert all products
const insertMany = db.transaction((productList: ProductType[]) => {
  for (const product of productList) {
    insertProduct.run(
      product.sku,
      product.name,
      product.category,
      product.variant,
      product.price_aud,
      product.inventory_count,
      product.low_stock_threshold,
      product.description,
      product.usage_instructions
    );
  }
});

insertMany(products);

console.log(`\nSeeded ${products.length} products!`);

// Verify and display results
const results = db.prepare('SELECT sku, name, category, inventory_count FROM products ORDER BY category, sku').all() as {
  sku: string;
  name: string;
  category: string;
  inventory_count: number;
}[];

console.log('\nProduct catalog:');
let currentCategory = '';
for (const product of results) {
  if (product.category !== currentCategory) {
    currentCategory = product.category;
    console.log(`\n[${currentCategory.toUpperCase()}]`);
  }
  const stockStatus =
    product.inventory_count === 0
      ? ' (OUT OF STOCK)'
      : product.inventory_count < 15
        ? ' (LOW STOCK)'
        : '';
  console.log(`  ${product.sku}: ${product.name} - ${product.inventory_count} units${stockStatus}`);
}

// Summary stats
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN inventory_count = 0 THEN 1 ELSE 0 END) as out_of_stock,
    SUM(CASE WHEN inventory_count > 0 AND inventory_count <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock
  FROM products
`).get() as { total: number; out_of_stock: number; low_stock: number };

console.log(`\nInventory summary:`);
console.log(`  Total products: ${stats.total}`);
console.log(`  Out of stock: ${stats.out_of_stock}`);
console.log(`  Low stock: ${stats.low_stock}`);

db.close();
