# Admin & Monitoring Library Reference

Quick reference for newly hardened utilities.

## CSV Import

### Parse CSV Data
```typescript
import { parseCSV, importContacts } from '@/lib/admin/data-import';

const csvText = `name,email,company
John Doe,john@example.com,Acme Inc
Jane Smith,jane@example.com,Widget Corp`;

const rows = parseCSV(csvText);
// [
//   { name: 'John Doe', email: 'john@example.com', company: 'Acme Inc' },
//   { name: 'Jane Smith', email: 'jane@example.com', company: 'Widget Corp' }
// ]
```

### Import Contacts
```typescript
const result = await importContacts(supabase, orgId, rows);
console.log(`Imported: ${result.imported}, Errors: ${result.errors.length}`);
if (result.errors.length > 0) {
  result.errors.forEach(err => console.log(`Row ${err.row}: ${err.message}`));
}
```

### Import Projects
```typescript
const projectRows = parseCSV(projectCSV);
const result = await importProjects(supabase, orgId, projectRows);
```

### Import Invoices
```typescript
const invoiceRows = parseCSV(invoiceCSV);
const result = await importInvoices(supabase, orgId, invoiceRows);
```

## Data Export

### Export Single Entity
```typescript
import { exportEntities } from '@/lib/admin/data-export';

const { data, filename, contentType } = await exportEntities(
  supabase,
  orgId,
  'contacts',
  'csv' // or 'json'
);

// Download file
const blob = new Blob([data], { type: contentType });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
```

### Export Multiple Entities
```typescript
const exports = await exportMultipleEntities(
  supabase,
  orgId,
  ['contacts', 'projects', 'invoices'],
  'csv'
);

exports.forEach(exp => {
  // Download each file
});
```

## Health Checks

### Quick Health Check
```typescript
import { runHealthChecks } from '@/lib/admin/health-check';

const services = await runHealthChecks(supabase);
services.forEach(service => {
  console.log(`${service.service}: ${service.status} (${service.latency_ms}ms)`);
});
```

### Full Health Check with Summary
```typescript
import { runFullHealthCheck } from '@/lib/admin/health-check';

const health = await runFullHealthCheck(supabase);

console.log(`Overall: ${health.overall_status}`);
console.log(`Issues: ${health.issues.join(', ')}`);

// Check specific areas
health.services.forEach(s => console.log(`${s.service}: ${s.status}`));
health.environment.forEach(e => console.log(`${e.key}: ${e.present ? 'OK' : 'MISSING'}`));
health.database_tables.forEach(t => console.log(`${t.table_name}: ${t.accessible ? 'OK' : 'FAIL'}`));
```

## Cost Tracking

### Estimate Cost
```typescript
import { estimateCost, formatCost } from '@/lib/monitoring/cost-tracker';

const estimate = estimateCost('claude-opus-4-20250514', 5000, 2000);
console.log(`Cost: ${formatCost(estimate.estimated_cost)}`);
```

### Get Cost Summary
```typescript
import { getCostSummaryFormatted } from '@/lib/monitoring/cost-tracker';

const summary = await getCostSummaryFormatted(supabase, '7d');
console.log(`Week Cost: ${summary.total_cost_formatted}`);
console.log(`Runs: ${summary.total_runs}`);
```

## Uptime Tracking

### Record Request Metric (in middleware)
```typescript
import { recordMetric } from '@/lib/monitoring/uptime-tracker';

const start = Date.now();
try {
  // Handle request
  recordMetric('/api/users', 'GET', 200, Date.now() - start);
} catch (err) {
  recordMetric('/api/users', 'GET', 500, Date.now() - start);
}
```

### Get Uptime Report
```typescript
import { getUptimeMetrics, formatUptimeReport } from '@/lib/monitoring/uptime-tracker';

const metrics = await getUptimeMetrics(supabase, 'api', '7d');
console.log(formatUptimeReport(metrics));
// Uptime: 99.9%
// Downtime: 1 minutes
// Avg Latency: 45ms
// P99 Latency: 120ms
```

## API Key Management

### Validate API Key
```typescript
import { validateAPIKey, maskKey } from '@/lib/security/api-key-validator';

const validation = validateAPIKey(userProvidedKey);
if (!validation.valid) {
  console.error(`Invalid key: ${validation.issues.join(', ')}`);
  // issues: ['API key must start with "sk-ant-"', ...]
}

// Safe for logging
console.log(`Key: ${maskKey(userProvidedKey)}`); // sk-a****wxyz
```

### Store and Rotate Keys
```typescript
import { storeAPIKey, rotateAPIKey } from '@/lib/security/api-key-validator';

// Store new key
const stored = await storeAPIKey(supabase, orgId, 'production-api', keyValue);
console.log(`Stored with ID: ${stored.id}`);

// Rotate key
const rotated = await rotateAPIKey(
  supabase,
  oldKeyId,
  orgId,
  'production-api',
  newKeyValue,
  new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
);
console.log(`New key ID: ${rotated.newKeyId}`);
```

### Check Expired Keys
```typescript
import { getExpiredKeys, revokeAPIKey } from '@/lib/security/api-key-validator';

const expired = await getExpiredKeys(supabase);
for (const key of expired) {
  console.log(`Key "${key.name}" expired on ${key.expires_at}`);
  await revokeAPIKey(supabase, key.id);
}
```

## RLS Audit

### Run RLS Audit
```typescript
import { auditRLS, formatAuditReport, generateRLSRecommendations } from '@/lib/security/rls-audit';

const audit = await auditRLS(supabase);

if (audit.passed) {
  console.log('All tables properly secured');
} else {
  console.error(`Issues found: ${audit.tables_with_issues}`);
  console.log(formatAuditReport(audit));

  const recommendations = generateRLSRecommendations(audit);
  recommendations.forEach(rec => console.log(`- ${rec}`));
}
```

### Get Tables at Risk
```typescript
import { getTablesAtRisk, isTableSecure } from '@/lib/security/rls-audit';

const audit = await auditRLS(supabase);
const atRisk = getTablesAtRisk(audit);

atRisk.forEach(table => {
  console.log(`⚠️ ${table.table_name}: ${table.issues.join(', ')}`);
});
```

## Sentry Monitoring

### Track Performance Metrics
```typescript
import { trackMetric, startSpan } from '@/lib/monitoring/sentry';

// Simple metric
await trackMetric('user_registration', 1, { source: 'web' });

// Performance span
const span = await startSpan('process_invoice');
try {
  // Do work
  span.end();
} catch (err) {
  span.recordException(err);
}
```

### Capture Errors
```typescript
import { captureException, withSentry } from '@/lib/monitoring/sentry';

// Manual capture
try {
  // risky code
} catch (err) {
  await captureException(err as Error, { context: 'user_signup' });
}

// Wrap async function
const safeFn = withSentry(myAsyncFunction, 'my_operation');
await safeFn();
```

## Secret Management

### Generate Secure Key
```typescript
import { generateAPIKey, validateAPIKey } from '@/lib/security/secrets';

const newKey = generateAPIKey(64);
console.log(`New key: ${newKey}`);

// Validate it
const validation = validateAPIKey(newKey);
console.log(`Valid: ${validation.valid}`);
```

### Environment Validation
```typescript
import { validateEnvironment } from '@/lib/security/secrets';

const result = validateEnvironment();
if (!result.valid) {
  console.error('Missing required env vars:', result.missing_required);
  process.exit(1);
}
```

### Record Key Rotation
```typescript
import { recordRotation, getOverdueRotations } from '@/lib/security/secrets';

// After rotating a key
await recordRotation(supabase, 'ANTHROPIC_API_KEY', 'admin@company.com');

// Check for overdue rotations
const overdue = await getOverdueRotations(supabase);
overdue.forEach(rot => {
  console.log(`⚠️ Key "${rot.secret_key}" was due on ${rot.next_rotation}`);
});
```

## Error Handling Patterns

### Handle Import Errors
```typescript
const result = await importContacts(supabase, orgId, rows);

// Show summary
console.log(`Success: ${result.imported}/${rows.length}`);

// Show per-row errors
result.errors.forEach(({ row, message }) => {
  console.error(`Row ${row + 1}: ${message}`);
});

// Suggest fixes
if (result.errors.length > 0) {
  const emailErrors = result.errors.filter(e => e.message.includes('email'));
  if (emailErrors.length > 0) {
    console.log(`💡 Check email format in rows: ${emailErrors.map(e => e.row + 1).join(', ')}`);
  }
}
```

### Handle Health Check Failures
```typescript
const health = await runFullHealthCheck(supabase);

if (health.overall_status === 'down') {
  // Send alert
  console.error('CRITICAL: System down', health.issues);
  // notifyOps(health.issues);
} else if (health.overall_status === 'degraded') {
  // Send warning
  console.warn('WARNING: System degraded', health.issues);
  // notifyOps(health.issues, 'warning');
}
```

## Type Safety

All functions are fully typed:

```typescript
// TypeScript knows the return type
const result: ImportResult = await importContacts(supabase, orgId, rows);

// Type-safe validation results
const validation: KeyValidationResult = validateAPIKey(key);

// Structured health check
const health: HealthCheckSummary = await runFullHealthCheck(supabase);

// Uptime metrics
const metrics: UptimeMetric = await getUptimeMetrics(supabase, 'api', '7d');
```

## Performance Tips

1. **Batch imports:** Use parseCSV() + import*() for 100-row batches
2. **Health checks:** Run full check once per minute, quick checks more often
3. **Cost tracking:** Cache summary by period to avoid re-aggregation
4. **Metrics:** Use in-memory buffer, persist periodically
5. **Key validation:** Cache validation results for repeated checks

## Troubleshooting

**CSV Parse Issues:**
- Check for inconsistent column counts
- Verify quoted fields are properly closed
- Ensure no BOM at file start

**Import Failures:**
- Check validation errors for specific row issues
- Verify org_id exists and matches data
- Check database constraints (unique emails, etc.)

**Health Check Timeouts:**
- May indicate network issues
- Check environment variables are set
- Verify API endpoints are accessible

**API Key Validation:**
- Different providers need different formats
- Check key hasn't been rotated
- Verify key hasn't expired

See `HARDENING_SUMMARY.md` for detailed documentation.
