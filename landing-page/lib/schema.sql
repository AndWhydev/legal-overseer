-- BitBit Database Schema
-- Matching CLIENT-PACK data objects

-- Approval items (unified inbox)
CREATE TABLE IF NOT EXISTS approval_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lane TEXT NOT NULL CHECK(lane IN ('xixi', 'allen')),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'needs_changes', 'escalated')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('low', 'medium', 'high')),
  due_date TEXT,

  -- Source content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sender_name TEXT,
  sender_email TEXT,

  -- Customer support fields (nullable for non-support items)
  order_number TEXT,
  tracking_number TEXT,
  order_date TEXT,
  delivery_status TEXT,
  has_shipping_insurance INTEGER DEFAULT 0,

  -- Content approval fields (nullable for non-content items)
  asset_link TEXT,
  platform TEXT,
  publish_date TEXT,

  -- Metadata
  attachments TEXT, -- JSON array
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tasks generated from approvals
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_item_id INTEGER REFERENCES approval_items(id),
  owner TEXT NOT NULL CHECK(owner IN ('xixi', 'allen')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done')),
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for all actions
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_item_id INTEGER REFERENCES approval_items(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT, -- JSON object
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_items_lane_status ON approval_items(lane, status);
CREATE INDEX IF NOT EXISTS idx_items_due_date ON approval_items(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_audit_item ON audit_log(approval_item_id);

-- ============================================
-- Agent Operations Schema (Phase 01-01)
-- ============================================

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  country TEXT DEFAULT 'AU',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT -- any special handling notes
);

-- Products catalog
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- gloves, tools, mitts, bundles, accessories
  variant TEXT, -- original, sensitive, mens
  price_aud REAL NOT NULL,
  inventory_count INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  description TEXT,
  usage_instructions TEXT
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL, -- e.g., "CG-12345"
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK(status IN ('processing', 'shipped', 'in_transit', 'delivered', 'delayed', 'lost', 'returned')),
  tracking_number TEXT,
  carrier TEXT, -- auspost, dhl, ups, etc.
  shipping_address TEXT NOT NULL,
  total_aud REAL NOT NULL,
  has_insurance INTEGER DEFAULT 0,
  order_date TEXT NOT NULL,
  ship_date TEXT,
  delivery_date TEXT,
  items TEXT NOT NULL, -- JSON array of {sku, qty, price}
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Agent actions audit log
CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL, -- groups actions in one agent run
  action_type TEXT NOT NULL, -- lookup_order, send_reply, create_task, escalate, etc.
  input TEXT NOT NULL, -- JSON: the incoming message/context
  reasoning TEXT, -- why agent chose this action
  output TEXT, -- JSON: what was returned/sent
  confidence INTEGER, -- 0-100
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for agent operations
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_agent_actions_session ON agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_type ON agent_actions(action_type);
