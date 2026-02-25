import db from '../lib/db';

console.log('Seeding customers and orders...');

// Helper: get date relative to today
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// Clear existing data (for re-seeding)
db.exec('DELETE FROM orders');
db.exec('DELETE FROM customers');

// ============================================
// CUSTOMERS (10+)
// ============================================

const insertCustomer = db.prepare(`
  INSERT INTO customers (email, name, phone, country, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const customers = [
  // AU Customers (majority)
  {
    email: 'sarah.mitchell@gmail.com',
    name: 'Sarah Mitchell',
    phone: '+61 412 345 678',
    country: 'AU',
    notes: 'VIP - influencer, 10K followers. Handle with care.',
  },
  {
    email: 'jessica.wong@outlook.com',
    name: 'Jessica Wong',
    phone: '+61 423 456 789',
    country: 'AU',
    notes: null,
  },
  {
    email: 'emma.johnson@yahoo.com.au',
    name: 'Emma Johnson',
    phone: '+61 434 567 890',
    country: 'AU',
    notes: 'Previous complaint resolved - shipping delay Dec 2025. Happy now.',
  },
  {
    email: 'olivia.chen@gmail.com',
    name: 'Olivia Chen',
    phone: '+61 445 678 901',
    country: 'AU',
    notes: 'Repeat customer - loves bundles',
  },
  {
    email: 'mia.taylor@hotmail.com',
    name: 'Mia Taylor',
    phone: '+61 456 789 012',
    country: 'AU',
    notes: null,
  },
  {
    email: 'chloe.brown@icloud.com',
    name: 'Chloe Brown',
    phone: '+61 467 890 123',
    country: 'AU',
    notes: 'Subscription customer since 2024',
  },
  // NZ Customer
  {
    email: 'grace.wilson@xtra.co.nz',
    name: 'Grace Wilson',
    phone: '+64 21 234 5678',
    country: 'NZ',
    notes: null,
  },
  // US Customer
  {
    email: 'rachel.smith@gmail.com',
    name: 'Rachel Smith',
    phone: '+1 310 555 1234',
    country: 'US',
    notes: 'Found us on TikTok',
  },
  // UK Customer
  {
    email: 'lily.davies@bt.com',
    name: 'Lily Davies',
    phone: '+44 7911 123456',
    country: 'UK',
    notes: null,
  },
  // Potential Wholesale
  {
    email: 'procurement@beautysupply.com.au',
    name: 'Beauty Supply Co',
    phone: '+61 2 9876 5432',
    country: 'AU',
    notes: 'Wholesale inquiry - interested in bulk orders',
  },
  // Extra AU customers for variety
  {
    email: 'amy.nguyen@gmail.com',
    name: 'Amy Nguyen',
    phone: '+61 478 901 234',
    country: 'AU',
    notes: 'First-time buyer',
  },
  {
    email: 'zoe.patel@outlook.com',
    name: 'Zoe Patel',
    phone: '+61 489 012 345',
    country: 'AU',
    notes: null,
  },
];

// Define customer type from the array
type CustomerType = typeof customers[0];

// Insert customers and track IDs
const customerIds: Record<string, number> = {};
const insertCustomers = db.transaction((customerList: CustomerType[]) => {
  for (const customer of customerList) {
    const result = insertCustomer.run(
      customer.email,
      customer.name,
      customer.phone,
      customer.country,
      customer.notes
    );
    customerIds[customer.email] = result.lastInsertRowid as number;
  }
});
insertCustomers(customers);

console.log(`\nSeeded ${customers.length} customers!`);

// ============================================
// ORDERS (25+) - Covering CLIENT-PACK scenarios
// ============================================

const insertOrder = db.prepare(`
  INSERT INTO orders (order_number, customer_id, status, tracking_number, carrier, shipping_address, total_aud, has_insurance, order_date, ship_date, delivery_date, items, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Australian addresses for realism
const auAddresses = {
  sarah: '42 Palm Beach Road, Sydney NSW 2000',
  jessica: '15 Chapel Street, Melbourne VIC 3000',
  emma: '8 King William Road, Adelaide SA 5000',
  olivia: '123 Queen Street, Brisbane QLD 4000',
  mia: '7 Murray Street, Perth WA 6000',
  chloe: '56 Liverpool Street, Hobart TAS 7000',
  amy: '89 Lygon Street, Carlton VIC 3053',
  zoe: '34 Oxford Street, Paddington NSW 2021',
};

const orders = [
  // ============================================
  // WISMO SCENARIOS (8 orders)
  // ============================================

  // 1. Order processing (placed yesterday)
  {
    order_number: 'CG-10001',
    customer_email: 'sarah.mitchell@gmail.com',
    status: 'processing',
    tracking_number: null,
    carrier: 'auspost',
    shipping_address: auAddresses.sarah,
    total_aud: 49.90,
    has_insurance: 0,
    order_date: daysAgo(1),
    ship_date: null,
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 2, price: 24.95 },
    ]),
    notes: 'Gift message: "Happy Birthday!"',
  },

  // 2. Order shipped (2 days ago, tracking available)
  {
    order_number: 'CG-10002',
    customer_email: 'jessica.wong@outlook.com',
    status: 'shipped',
    tracking_number: 'AP123456789AU',
    carrier: 'auspost',
    shipping_address: auAddresses.jessica,
    total_aud: 26.95,
    has_insurance: 0,
    order_date: daysAgo(4),
    ship_date: daysAgo(2),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-SN', qty: 1, price: 26.95 },
    ]),
    notes: null,
  },

  // 3. Order in transit (5 days, normal)
  {
    order_number: 'CG-10003',
    customer_email: 'emma.johnson@yahoo.com.au',
    status: 'in_transit',
    tracking_number: 'AP234567890AU',
    carrier: 'auspost',
    shipping_address: auAddresses.emma,
    total_aud: 64.90,
    has_insurance: 0,
    order_date: daysAgo(7),
    ship_date: daysAgo(5),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 1, price: 24.95 },
      { sku: 'CG-BRS-DRY', qty: 1, price: 34.95 },
      { sku: 'CG-BAG-TRV', qty: 1, price: 14.95 },
    ]),
    notes: null,
  },

  // 4. Order delivered (received confirmation)
  {
    order_number: 'CG-10004',
    customer_email: 'olivia.chen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP345678901AU',
    carrier: 'auspost',
    shipping_address: auAddresses.olivia,
    total_aud: 99.95,
    has_insurance: 1,
    order_date: daysAgo(10),
    ship_date: daysAgo(8),
    delivery_date: daysAgo(3),
    items: JSON.stringify([
      { sku: 'CG-BND-ULT', qty: 1, price: 99.95 },
    ]),
    notes: 'Express shipping',
  },

  // 5. Order delayed (carrier delay, 10+ days)
  {
    order_number: 'CG-10005',
    customer_email: 'mia.taylor@hotmail.com',
    status: 'delayed',
    tracking_number: 'AP456789012AU',
    carrier: 'auspost',
    shipping_address: auAddresses.mia,
    total_aud: 54.95,
    has_insurance: 0,
    order_date: daysAgo(14),
    ship_date: daysAgo(12),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-BND-GFT', qty: 1, price: 54.95 },
    ]),
    notes: 'Carrier reported delay in WA region',
  },

  // 6. Order "delivered" but customer claims not received (10-day window test)
  {
    order_number: 'CG-10006',
    customer_email: 'chloe.brown@icloud.com',
    status: 'delivered',
    tracking_number: 'AP567890123AU',
    carrier: 'auspost',
    shipping_address: auAddresses.chloe,
    total_aud: 49.95,
    has_insurance: 0,
    order_date: daysAgo(12),
    ship_date: daysAgo(10),
    delivery_date: daysAgo(5), // Within 10-day claim window
    items: JSON.stringify([
      { sku: 'CG-BND-STR', qty: 1, price: 49.95 },
    ]),
    notes: 'Customer contacted - says not received. Within 10-day window.',
  },

  // 7. International order in transit (NZ)
  {
    order_number: 'CG-10007',
    customer_email: 'grace.wilson@xtra.co.nz',
    status: 'in_transit',
    tracking_number: 'DHL1234567890',
    carrier: 'dhl',
    shipping_address: '25 Queen Street, Auckland 1010, New Zealand',
    total_aud: 165.00,
    has_insurance: 1,
    order_date: daysAgo(6),
    ship_date: daysAgo(4),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 2, price: 24.95 },
      { sku: 'CG-GLV-SN', qty: 2, price: 26.95 },
      { sku: 'CG-BND-STR', qty: 1, price: 49.95 },
    ]),
    notes: 'Free shipping - over $160 NZ threshold',
  },

  // 8. Express shipping order (US)
  {
    order_number: 'CG-10008',
    customer_email: 'rachel.smith@gmail.com',
    status: 'in_transit',
    tracking_number: 'UPS1Z999AA10123456784',
    carrier: 'ups',
    shipping_address: '1234 Sunset Blvd, Los Angeles CA 90028, USA',
    total_aud: 210.00,
    has_insurance: 1,
    order_date: daysAgo(5),
    ship_date: daysAgo(3),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-BND-ULT', qty: 2, price: 99.95 },
    ]),
    notes: 'Express international - free shipping over $200 USD',
  },

  // ============================================
  // RETURN/REFUND SCENARIOS (5 orders)
  // ============================================

  // 9. Recent order (within 30 days) - eligible for return
  {
    order_number: 'CG-10009',
    customer_email: 'amy.nguyen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP678901234AU',
    carrier: 'auspost',
    shipping_address: auAddresses.amy,
    total_aud: 24.95,
    has_insurance: 0,
    order_date: daysAgo(20),
    ship_date: daysAgo(18),
    delivery_date: daysAgo(15),
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 1, price: 24.95 },
    ]),
    notes: 'Customer wants to return - bought wrong size. UNOPENED.',
  },

  // 10. Old order (45 days ago) - ineligible for return
  {
    order_number: 'CG-10010',
    customer_email: 'zoe.patel@outlook.com',
    status: 'delivered',
    tracking_number: 'AP789012345AU',
    carrier: 'auspost',
    shipping_address: auAddresses.zoe,
    total_aud: 34.95,
    has_insurance: 0,
    order_date: daysAgo(45),
    ship_date: daysAgo(43),
    delivery_date: daysAgo(40),
    items: JSON.stringify([
      { sku: 'CG-BRS-DRY', qty: 1, price: 34.95 },
    ]),
    notes: 'Customer requesting return - OUTSIDE 30-day window',
  },

  // 11. Opened/used product return attempt
  {
    order_number: 'CG-10011',
    customer_email: 'sarah.mitchell@gmail.com',
    status: 'delivered',
    tracking_number: 'AP890123456AU',
    carrier: 'auspost',
    shipping_address: auAddresses.sarah,
    total_aud: 26.95,
    has_insurance: 0,
    order_date: daysAgo(25),
    ship_date: daysAgo(23),
    delivery_date: daysAgo(20),
    items: JSON.stringify([
      { sku: 'CG-GLV-MN', qty: 1, price: 26.95 },
    ]),
    notes: 'Customer wants return - USED product (not eligible per policy)',
  },

  // 12. Valid return request pending
  {
    order_number: 'CG-10012',
    customer_email: 'jessica.wong@outlook.com',
    status: 'returned',
    tracking_number: 'AP901234567AU',
    carrier: 'auspost',
    shipping_address: auAddresses.jessica,
    total_aud: 54.95,
    has_insurance: 0,
    order_date: daysAgo(22),
    ship_date: daysAgo(20),
    delivery_date: daysAgo(17),
    items: JSON.stringify([
      { sku: 'CG-BND-GFT', qty: 1, price: 54.95 },
    ]),
    notes: 'Return in progress - unopened, within 30 days. Awaiting package.',
  },

  // 13. Completed return/refund
  {
    order_number: 'CG-10013',
    customer_email: 'emma.johnson@yahoo.com.au',
    status: 'returned',
    tracking_number: 'AP012345678AU',
    carrier: 'auspost',
    shipping_address: auAddresses.emma,
    total_aud: 19.95,
    has_insurance: 0,
    order_date: daysAgo(35),
    ship_date: daysAgo(33),
    delivery_date: daysAgo(30),
    items: JSON.stringify([
      { sku: 'CG-GLV-FC', qty: 1, price: 19.95 },
    ]),
    notes: 'REFUND COMPLETED - returned unopened Jan 10',
  },

  // ============================================
  // PROBLEM SCENARIOS (6 orders)
  // ============================================

  // 14. Missing item in parcel
  {
    order_number: 'CG-10014',
    customer_email: 'olivia.chen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP112233445AU',
    carrier: 'auspost',
    shipping_address: auAddresses.olivia,
    total_aud: 74.90,
    has_insurance: 0,
    order_date: daysAgo(8),
    ship_date: daysAgo(6),
    delivery_date: daysAgo(3),
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 1, price: 24.95 },
      { sku: 'CG-BND-STR', qty: 1, price: 49.95 },
    ]),
    notes: 'Customer reports MISSING ITEM - Starter Bundle not in parcel. Glove received.',
  },

  // 15. Wrong item sent
  {
    order_number: 'CG-10015',
    customer_email: 'mia.taylor@hotmail.com',
    status: 'delivered',
    tracking_number: 'AP223344556AU',
    carrier: 'auspost',
    shipping_address: auAddresses.mia,
    total_aud: 26.95,
    has_insurance: 0,
    order_date: daysAgo(6),
    ship_date: daysAgo(4),
    delivery_date: daysAgo(2),
    items: JSON.stringify([
      { sku: 'CG-GLV-SN', qty: 1, price: 26.95 },
    ]),
    notes: 'WRONG ITEM SENT - ordered Sensitive, received Original glove',
  },

  // 16. Damaged in transit (with insurance)
  {
    order_number: 'CG-10016',
    customer_email: 'lily.davies@bt.com',
    status: 'delivered',
    tracking_number: 'DHL9876543210',
    carrier: 'dhl',
    shipping_address: '10 Oxford Street, London W1D 1BS, UK',
    total_aud: 185.00,
    has_insurance: 1,
    order_date: daysAgo(15),
    ship_date: daysAgo(13),
    delivery_date: daysAgo(8),
    items: JSON.stringify([
      { sku: 'CG-BND-ULT', qty: 1, price: 99.95 },
      { sku: 'CG-GLV-OG', qty: 2, price: 24.95 },
      { sku: 'CG-BRS-DRY', qty: 1, price: 34.95 },
    ]),
    notes: 'DAMAGED IN TRANSIT - box crushed, scrub bottle broken. HAS INSURANCE.',
  },

  // 17. Damaged in transit (no insurance)
  {
    order_number: 'CG-10017',
    customer_email: 'chloe.brown@icloud.com',
    status: 'delivered',
    tracking_number: 'AP334455667AU',
    carrier: 'auspost',
    shipping_address: auAddresses.chloe,
    total_aud: 29.95,
    has_insurance: 0,
    order_date: daysAgo(9),
    ship_date: daysAgo(7),
    delivery_date: daysAgo(4),
    items: JSON.stringify([
      { sku: 'CG-SCR-BOD', qty: 1, price: 29.95 },
    ]),
    notes: 'DAMAGED - scrub bottle cracked and leaked. NO INSURANCE.',
  },

  // 18. Stolen after delivery (no insurance)
  {
    order_number: 'CG-10018',
    customer_email: 'amy.nguyen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP445566778AU',
    carrier: 'auspost',
    shipping_address: auAddresses.amy,
    total_aud: 49.95,
    has_insurance: 0,
    order_date: daysAgo(18),
    ship_date: daysAgo(16),
    delivery_date: daysAgo(13), // Outside 10-day claim window
    items: JSON.stringify([
      { sku: 'CG-BND-STR', qty: 1, price: 49.95 },
    ]),
    notes: 'Customer claims STOLEN from porch. Delivered 13 days ago (outside 10-day window). NO INSURANCE.',
  },

  // 19. Address correction needed
  {
    order_number: 'CG-10019',
    customer_email: 'zoe.patel@outlook.com',
    status: 'processing',
    tracking_number: null,
    carrier: 'auspost',
    shipping_address: '34 Oxford Street, Paddington NSW', // Missing postcode
    total_aud: 26.95,
    has_insurance: 0,
    order_date: daysAgo(1),
    ship_date: null,
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-MN', qty: 1, price: 26.95 },
    ]),
    notes: 'HOLD - ADDRESS INCOMPLETE. Missing postcode. Customer contacted.',
  },

  // ============================================
  // HAPPY PATH SCENARIOS (6 orders)
  // ============================================

  // 20. Repeat customer, multiple orders (older order)
  {
    order_number: 'CG-10020',
    customer_email: 'olivia.chen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP556677889AU',
    carrier: 'auspost',
    shipping_address: auAddresses.olivia,
    total_aud: 49.90,
    has_insurance: 0,
    order_date: daysAgo(60),
    ship_date: daysAgo(58),
    delivery_date: daysAgo(55),
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 2, price: 24.95 },
    ]),
    notes: 'Repeat customer - 3rd order',
  },

  // 21. Subscription customer order
  {
    order_number: 'CG-10021',
    customer_email: 'chloe.brown@icloud.com',
    status: 'in_transit',
    tracking_number: 'AP667788990AU',
    carrier: 'auspost',
    shipping_address: auAddresses.chloe,
    total_aud: 24.95,
    has_insurance: 0,
    order_date: daysAgo(3),
    ship_date: daysAgo(2),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 1, price: 24.95 },
    ]),
    notes: 'SUBSCRIPTION - 6th delivery. Auto-renew every 8 weeks.',
  },

  // 22. First-time buyer (successful)
  {
    order_number: 'CG-10022',
    customer_email: 'amy.nguyen@gmail.com',
    status: 'delivered',
    tracking_number: 'AP778899001AU',
    carrier: 'auspost',
    shipping_address: auAddresses.amy,
    total_aud: 24.95,
    has_insurance: 0,
    order_date: daysAgo(30),
    ship_date: daysAgo(28),
    delivery_date: daysAgo(25),
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 1, price: 24.95 },
    ]),
    notes: 'First order - found us on TikTok',
  },

  // 23. Gift purchase
  {
    order_number: 'CG-10023',
    customer_email: 'jessica.wong@outlook.com',
    status: 'delivered',
    tracking_number: 'AP889900112AU',
    carrier: 'auspost',
    shipping_address: '99 Gift Lane, Richmond VIC 3121', // Different address (gift)
    total_aud: 54.95,
    has_insurance: 0,
    order_date: daysAgo(25),
    ship_date: daysAgo(23),
    delivery_date: daysAgo(20),
    items: JSON.stringify([
      { sku: 'CG-BND-GFT', qty: 1, price: 54.95 },
    ]),
    notes: 'GIFT - shipped to different address. Include gift message.',
  },

  // 24. Bundle purchase (high value)
  {
    order_number: 'CG-10024',
    customer_email: 'sarah.mitchell@gmail.com',
    status: 'delivered',
    tracking_number: 'AP990011223AU',
    carrier: 'auspost',
    shipping_address: auAddresses.sarah,
    total_aud: 199.90,
    has_insurance: 1,
    order_date: daysAgo(40),
    ship_date: daysAgo(38),
    delivery_date: daysAgo(35),
    items: JSON.stringify([
      { sku: 'CG-BND-ULT', qty: 2, price: 99.95 },
    ]),
    notes: 'VIP order - express shipping, insurance included',
  },

  // 25. International wholesale inquiry order
  {
    order_number: 'CG-10025',
    customer_email: 'procurement@beautysupply.com.au',
    status: 'processing',
    tracking_number: null,
    carrier: null,
    shipping_address: '500 Industry Road, Alexandria NSW 2015',
    total_aud: 1249.50,
    has_insurance: 1,
    order_date: daysAgo(2),
    ship_date: null,
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-GLV-OG', qty: 25, price: 24.95 },
      { sku: 'CG-GLV-SN', qty: 15, price: 26.95 },
      { sku: 'CG-GLV-MN', qty: 10, price: 26.95 },
    ]),
    notes: 'WHOLESALE INQUIRY - bulk order. Awaiting payment confirmation.',
  },

  // Additional orders for variety (26-28)
  {
    order_number: 'CG-10026',
    customer_email: 'emma.johnson@yahoo.com.au',
    status: 'delivered',
    tracking_number: 'AP001122334AU',
    carrier: 'auspost',
    shipping_address: auAddresses.emma,
    total_aud: 39.90,
    has_insurance: 0,
    order_date: daysAgo(50),
    ship_date: daysAgo(48),
    delivery_date: daysAgo(45),
    items: JSON.stringify([
      { sku: 'CG-GLV-FC', qty: 2, price: 19.95 },
    ]),
    notes: null,
  },

  {
    order_number: 'CG-10027',
    customer_email: 'mia.taylor@hotmail.com',
    status: 'delivered',
    tracking_number: 'AP112233445AU',
    carrier: 'auspost',
    shipping_address: auAddresses.mia,
    total_aud: 64.90,
    has_insurance: 0,
    order_date: daysAgo(35),
    ship_date: daysAgo(33),
    delivery_date: daysAgo(30),
    items: JSON.stringify([
      { sku: 'CG-BND-STR', qty: 1, price: 49.95 },
      { sku: 'CG-BAG-WSH', qty: 1, price: 12.95 },
    ]),
    notes: null,
  },

  // Lost package scenario
  {
    order_number: 'CG-10028',
    customer_email: 'grace.wilson@xtra.co.nz',
    status: 'lost',
    tracking_number: 'DHL5544332211',
    carrier: 'dhl',
    shipping_address: '25 Queen Street, Auckland 1010, New Zealand',
    total_aud: 99.95,
    has_insurance: 1,
    order_date: daysAgo(25),
    ship_date: daysAgo(23),
    delivery_date: null,
    items: JSON.stringify([
      { sku: 'CG-BND-ULT', qty: 1, price: 99.95 },
    ]),
    notes: 'LOST IN TRANSIT - carrier investigation in progress. HAS INSURANCE.',
  },
];

// Define order type from the array
type OrderType = typeof orders[0];

// Insert all orders
const insertOrders = db.transaction((orderList: OrderType[]) => {
  for (const order of orderList) {
    const customerId = customerIds[order.customer_email];
    if (!customerId) {
      console.error(`Customer not found: ${order.customer_email}`);
      continue;
    }
    insertOrder.run(
      order.order_number,
      customerId,
      order.status,
      order.tracking_number,
      order.carrier,
      order.shipping_address,
      order.total_aud,
      order.has_insurance,
      order.order_date,
      order.ship_date,
      order.delivery_date,
      order.items,
      order.notes
    );
  }
});
insertOrders(orders);

console.log(`Seeded ${orders.length} orders!`);

// ============================================
// VERIFICATION
// ============================================

console.log('\n--- VERIFICATION ---\n');

// Customer count
const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
console.log(`Customers: ${customerCount.count}`);

// Order count by status
const orderStats = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM orders
  GROUP BY status
  ORDER BY count DESC
`).all() as { status: string; count: number }[];

console.log(`\nOrders by status:`);
for (const stat of orderStats) {
  console.log(`  ${stat.status}: ${stat.count}`);
}

// Order count total
const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
console.log(`\nTotal orders: ${orderCount.count}`);

// Scenario coverage check
console.log('\nScenario coverage:');
console.log('  WISMO: 8 orders (processing, shipped, in_transit, delivered, delayed, claim window, international, express)');
console.log('  Returns: 5 orders (eligible, ineligible, used, pending, completed)');
console.log('  Problems: 6 orders (missing item, wrong item, damaged+insurance, damaged-no insurance, stolen, address issue)');
console.log('  Happy path: 6+ orders (repeat customer, subscription, first-time, gift, bundle, wholesale)');

// Sample order display
console.log('\nSample orders:');
const sampleOrders = db.prepare(`
  SELECT o.order_number, c.name, o.status, o.total_aud, o.notes
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  ORDER BY o.order_date DESC
  LIMIT 5
`).all() as { order_number: string; name: string; status: string; total_aud: number; notes: string | null }[];

for (const order of sampleOrders) {
  console.log(`  ${order.order_number} | ${order.name} | ${order.status} | $${order.total_aud.toFixed(2)}`);
  if (order.notes) {
    console.log(`    Notes: ${order.notes.substring(0, 60)}...`);
  }
}

db.close();

console.log('\nSeed complete!');
