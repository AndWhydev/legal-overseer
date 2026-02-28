import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importContacts, importProjects, importInvoices, type ImportResult } from '../data-import';

describe('Contact Import Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import valid contact', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const contacts = [{ name: 'John Doe', email: 'john@example.com' }];
    const result = await importContacts(mockSupabase as any, 'org1', contacts);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject contact with missing name', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const contacts = [{ email: 'test@example.com' }];
    const result = await importContacts(mockSupabase as any, 'org1', contacts);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing required field "name"');
  });

  it('should reject contact with invalid email', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const contacts = [{ name: 'John', email: 'not-an-email' }];
    const result = await importContacts(mockSupabase as any, 'org1', contacts);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('invalid email');
  });

  it('should accept contact with valid email format', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const contacts = [{ name: 'Jane Doe', email: 'jane@example.com' }];
    const result = await importContacts(mockSupabase as any, 'org1', contacts);
    expect(result.imported).toBe(1);
  });

  it('should skip contact on database error', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'Constraint violation' } }),
      })),
    };

    const contacts = [{ name: 'John', email: 'john@example.com' }];
    const result = await importContacts(mockSupabase as any, 'org1', contacts);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('Constraint violation');
  });
});

describe('Project Import Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import valid project', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const projects = [{ name: 'Project 1', status: 'active' }];
    const result = await importProjects(mockSupabase as any, 'org1', projects);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('should reject project with missing name', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const projects = [{ status: 'active' }];
    const result = await importProjects(mockSupabase as any, 'org1', projects);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing required field "name"');
  });

  it('should import project with optional fields', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const projects = [
      {
        name: 'Project 1',
        client_name: 'ACME Inc',
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        budget: 50000,
      },
    ];
    const result = await importProjects(mockSupabase as any, 'org1', projects);
    expect(result.imported).toBe(1);
  });

  it('should default status to active', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const projects = [{ name: 'Project 1' }];
    const result = await importProjects(mockSupabase as any, 'org1', projects);
    expect(result.imported).toBe(1);
  });
});

describe('Invoice Import Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import valid invoice', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: 1000, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('should reject invoice with missing amount', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing or invalid "amount"');
  });

  it('should reject invoice with zero amount', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: 0, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing or invalid "amount"');
  });

  it('should reject invoice with negative amount', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: -100, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing or invalid "amount"');
  });

  it('should reject invoice with missing due_date', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: 1000 }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('missing required field "due_date"');
  });

  it('should default currency to AUD', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: 1000, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.imported).toBe(1);
  });

  it('should default status to draft', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    };

    const invoices = [{ amount: 1000, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.imported).toBe(1);
  });

  it('should handle database error gracefully', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } }),
      })),
    };

    const invoices = [{ amount: 1000, due_date: '2026-03-01' }];
    const result = await importInvoices(mockSupabase as any, 'org1', invoices);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('Insert failed');
  });
});
