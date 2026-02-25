import db from '../db';

// ============================================
// Order Types
// ============================================

export interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

export type OrderStatus = 'processing' | 'shipped' | 'in_transit' | 'delivered' | 'delayed' | 'lost' | 'returned';

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  status: OrderStatus;
  tracking_number: string | null;
  carrier: string | null;
  shipping_address: string;
  total_aud: number;
  has_insurance: boolean;
  order_date: string;
  ship_date: string | null;
  delivery_date: string | null;
  items: OrderItem[];
  notes: string | null;
}

export interface Customer {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  country: string;
  notes: string | null;
}

export interface ShippingStatus {
  status: OrderStatus;
  tracking_number: string | null;
  carrier: string | null;
  ship_date: string | null;
  estimated_delivery: string | null;
  days_since_shipped: number | null;
}

export interface CustomerOrderHistory {
  customer: Customer;
  orders: Order[];
  total_spent: number;
  order_count: number;
}

// ============================================
// Helper Functions
// ============================================

function parseOrder(row: any): Order {
  return {
    id: row.id,
    order_number: row.order_number,
    customer_id: row.customer_id,
    status: row.status as OrderStatus,
    tracking_number: row.tracking_number,
    carrier: row.carrier,
    shipping_address: row.shipping_address,
    total_aud: row.total_aud,
    has_insurance: Boolean(row.has_insurance),
    order_date: row.order_date,
    ship_date: row.ship_date,
    delivery_date: row.delivery_date,
    items: JSON.parse(row.items || '[]') as OrderItem[],
    notes: row.notes,
  };
}

function parseCustomer(row: any): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    country: row.country,
    notes: row.notes,
  };
}

function calculateDaysSinceShipped(shipDate: string | null): number | null {
  if (!shipDate) return null;
  const shipped = new Date(shipDate);
  const now = new Date();
  const diffMs = now.getTime() - shipped.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// Order Service Functions
// ============================================

/**
 * Lookup an order by its order number
 */
export function lookupOrder(orderNumber: string): Order | null {
  const row = db.prepare(
    'SELECT * FROM orders WHERE order_number = ?'
  ).get(orderNumber);

  if (!row) {
    console.log(`[OrderService] lookupOrder(${orderNumber}) -> not found`);
    return null;
  }

  console.log(`[OrderService] lookupOrder(${orderNumber}) -> found`);
  return parseOrder(row);
}

/**
 * Lookup an order by tracking number
 */
export function lookupOrderByTracking(trackingNumber: string): Order | null {
  const row = db.prepare(
    'SELECT * FROM orders WHERE tracking_number = ?'
  ).get(trackingNumber);

  if (!row) {
    console.log(`[OrderService] lookupOrderByTracking(${trackingNumber}) -> not found`);
    return null;
  }

  console.log(`[OrderService] lookupOrderByTracking(${trackingNumber}) -> found`);
  return parseOrder(row);
}

/**
 * Get all orders for a customer by email
 */
export function getOrdersByCustomer(email: string): Order[] {
  const customer = db.prepare(
    'SELECT id FROM customers WHERE email = ?'
  ).get(email) as { id: number } | undefined;

  if (!customer) {
    console.log(`[OrderService] getOrdersByCustomer(${email}) -> customer not found`);
    return [];
  }

  const rows = db.prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC'
  ).all(customer.id);

  console.log(`[OrderService] getOrdersByCustomer(${email}) -> ${rows.length} orders`);
  return rows.map(parseOrder);
}

/**
 * Get shipping status for an order
 */
export function getShippingStatus(orderNumber: string): ShippingStatus | null {
  const order = lookupOrder(orderNumber);

  if (!order) {
    return null;
  }

  const daysSinceShipped = calculateDaysSinceShipped(order.ship_date);

  // Estimate delivery based on carrier and status
  let estimatedDelivery: string | null = null;
  if (order.ship_date && !order.delivery_date && order.status !== 'delivered') {
    const shipDate = new Date(order.ship_date);
    // Simple estimate: 3-5 business days for AU, 7-14 for international
    const daysToAdd = order.shipping_address.includes('Australia') ? 5 : 14;
    shipDate.setDate(shipDate.getDate() + daysToAdd);
    estimatedDelivery = shipDate.toISOString().split('T')[0];
  }

  console.log(`[OrderService] getShippingStatus(${orderNumber}) -> ${order.status}`);

  return {
    status: order.status,
    tracking_number: order.tracking_number,
    carrier: order.carrier,
    ship_date: order.ship_date,
    estimated_delivery: estimatedDelivery,
    days_since_shipped: daysSinceShipped,
  };
}

/**
 * Get customer by email
 */
export function getCustomerByEmail(email: string): Customer | null {
  const row = db.prepare(
    'SELECT * FROM customers WHERE email = ?'
  ).get(email);

  if (!row) {
    console.log(`[OrderService] getCustomerByEmail(${email}) -> not found`);
    return null;
  }

  console.log(`[OrderService] getCustomerByEmail(${email}) -> found`);
  return parseCustomer(row);
}

/**
 * Get full customer profile with order history
 */
export function getCustomerOrderHistory(email: string): CustomerOrderHistory | null {
  const customer = getCustomerByEmail(email);

  if (!customer) {
    return null;
  }

  const orders = getOrdersByCustomer(email);
  const totalSpent = orders.reduce((sum, order) => sum + order.total_aud, 0);

  console.log(`[OrderService] getCustomerOrderHistory(${email}) -> ${orders.length} orders, $${totalSpent.toFixed(2)} total`);

  return {
    customer,
    orders,
    total_spent: totalSpent,
    order_count: orders.length,
  };
}
