import db from '../lib/db';

console.log('Running agent operations migration...');

// Customers table
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    country TEXT DEFAULT 'AU',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )
`);
console.log('  - customers table created');

// Products catalog
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    variant TEXT,
    price_aud REAL NOT NULL,
    inventory_count INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    description TEXT,
    usage_instructions TEXT
  )
`);
console.log('  - products table created');

// Orders table
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status TEXT NOT NULL CHECK(status IN ('processing', 'shipped', 'in_transit', 'delivered', 'delayed', 'lost', 'returned')),
    tracking_number TEXT,
    carrier TEXT,
    shipping_address TEXT NOT NULL,
    total_aud REAL NOT NULL,
    has_insurance INTEGER DEFAULT 0,
    order_date TEXT NOT NULL,
    ship_date TEXT,
    delivery_date TEXT,
    items TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  - orders table created');

// Agent actions audit log
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    input TEXT NOT NULL,
    reasoning TEXT,
    output TEXT,
    confidence INTEGER,
    success INTEGER DEFAULT 1,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  - agent_actions table created');

// Create indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_actions_session ON agent_actions(session_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_actions_type ON agent_actions(action_type)`);
console.log('  - indexes created');

console.log('\nAgent operations migration complete!');

// Verify tables exist
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];

console.log('\nAll tables:');
tables.forEach((t) => console.log(`  - ${t.name}`));

db.close();
