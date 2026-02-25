import db from '../lib/db';
import fs from 'fs';
import path from 'path';

// Read and execute schema
const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

console.log('Initializing BitBit database...');

// Execute schema (split by semicolons to handle multiple statements)
const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of statements) {
  db.exec(statement);
}

console.log('Database initialized successfully!');

// Verify tables exist
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];

console.log('Tables created:');
tables.forEach((t) => console.log(`  - ${t.name}`));

// Close database
db.close();
