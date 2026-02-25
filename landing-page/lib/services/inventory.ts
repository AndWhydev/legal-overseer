import db from '../db';

// ============================================
// Inventory Types
// ============================================

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  variant: string | null;
  price_aud: number;
  inventory_count: number;
  low_stock_threshold: number;
  description: string | null;
  usage_instructions: string | null;
  in_stock: boolean;
  low_stock: boolean;
}

export interface StockStatus {
  sku: string;
  name: string;
  inventory_count: number;
  in_stock: boolean;
  low_stock: boolean;
  reorder_suggested: boolean;
}

// ============================================
// Helper Functions
// ============================================

function parseProduct(row: any): Product {
  const inventoryCount = row.inventory_count || 0;
  const threshold = row.low_stock_threshold || 10;

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    variant: row.variant,
    price_aud: row.price_aud,
    inventory_count: inventoryCount,
    low_stock_threshold: threshold,
    description: row.description,
    usage_instructions: row.usage_instructions,
    in_stock: inventoryCount > 0,
    low_stock: inventoryCount <= threshold,
  };
}

// ============================================
// Inventory Service Functions
// ============================================

/**
 * Check stock status for a product by SKU
 */
export function checkStock(sku: string): StockStatus | null {
  const row = db.prepare(
    'SELECT * FROM products WHERE sku = ?'
  ).get(sku);

  if (!row) {
    console.log(`[InventoryService] checkStock(${sku}) -> not found`);
    return null;
  }

  const product = parseProduct(row);

  console.log(
    `[InventoryService] checkStock(${sku}) -> ${product.inventory_count} units` +
    `${product.low_stock ? ' (LOW STOCK)' : ''}` +
    `${!product.in_stock ? ' (OUT OF STOCK)' : ''}`
  );

  return {
    sku: product.sku,
    name: product.name,
    inventory_count: product.inventory_count,
    in_stock: product.in_stock,
    low_stock: product.low_stock,
    reorder_suggested: product.low_stock || !product.in_stock,
  };
}

/**
 * Get full product information by SKU
 */
export function getProductInfo(sku: string): Product | null {
  const row = db.prepare(
    'SELECT * FROM products WHERE sku = ?'
  ).get(sku);

  if (!row) {
    console.log(`[InventoryService] getProductInfo(${sku}) -> not found`);
    return null;
  }

  console.log(`[InventoryService] getProductInfo(${sku}) -> found`);
  return parseProduct(row);
}

/**
 * Get all products with low stock (inventory <= threshold)
 */
export function getLowStockProducts(): Product[] {
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE inventory_count <= low_stock_threshold
    ORDER BY inventory_count ASC
  `).all();

  console.log(`[InventoryService] getLowStockProducts() -> ${rows.length} products`);
  return rows.map(parseProduct);
}

/**
 * Get all products in catalog
 */
export function getAllProducts(): Product[] {
  const rows = db.prepare(`
    SELECT * FROM products
    ORDER BY category, name
  `).all();

  console.log(`[InventoryService] getAllProducts() -> ${rows.length} products`);
  return rows.map(parseProduct);
}

/**
 * Get products by category
 */
export function getProductsByCategory(category: string): Product[] {
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE category = ?
    ORDER BY name
  `).all(category);

  console.log(`[InventoryService] getProductsByCategory(${category}) -> ${rows.length} products`);
  return rows.map(parseProduct);
}

/**
 * Search products by name (partial match)
 */
export function searchProducts(query: string): Product[] {
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ?
    ORDER BY name
  `).all(`%${query}%`);

  console.log(`[InventoryService] searchProducts("${query}") -> ${rows.length} products`);
  return rows.map(parseProduct);
}
