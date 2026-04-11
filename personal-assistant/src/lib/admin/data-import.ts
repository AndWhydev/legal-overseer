import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

interface ContactRow {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  [key: string]: unknown;
}

interface ProjectRow {
  name?: string;
  client_name?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  [key: string]: unknown;
}

interface InvoiceRow {
  contact_email?: string;
  amount?: number;
  currency?: string;
  due_date?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateContact(row: ContactRow, idx: number): string | null {
  if (!row.name || typeof row.name !== 'string' || row.name.trim().length === 0) {
    return `Row ${idx}: missing required field "name"`;
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return `Row ${idx}: invalid email "${row.email}"`;
  }
  return null;
}

function validateProject(row: ProjectRow, idx: number): string | null {
  if (!row.name || typeof row.name !== 'string' || row.name.trim().length === 0) {
    return `Row ${idx}: missing required field "name"`;
  }
  return null;
}

function validateInvoice(row: InvoiceRow, idx: number): string | null {
  if (row.amount == null || typeof row.amount !== 'number' || row.amount <= 0) {
    return `Row ${idx}: missing or invalid "amount"`;
  }
  if (!row.due_date) {
    return `Row ${idx}: missing required field "due_date"`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Import functions
// ---------------------------------------------------------------------------

export async function importContacts(
  supabase: SupabaseClient,
  orgId: string,
  data: ContactRow[],
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const err = validateContact(row, i);
    if (err) {
      result.errors.push({ row: i, message: err });
      result.skipped++;
      continue;
    }

    const { error } = await supabase.from('contacts').upsert(
      {
        org_id: orgId,
        name: row.name!.trim(),
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        company: row.company?.trim() || null,
        notes: row.notes?.trim() || null,
      },
      { onConflict: 'org_id,email', ignoreDuplicates: false },
    );

    if (error) {
      result.errors.push({ row: i, message: error.message });
      result.skipped++;
    } else {
      result.imported++;
    }
  }

  return result;
}

export async function importProjects(
  supabase: SupabaseClient,
  orgId: string,
  data: ProjectRow[],
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const err = validateProject(row, i);
    if (err) {
      result.errors.push({ row: i, message: err });
      result.skipped++;
      continue;
    }

    const { error } = await supabase.from('projects').upsert(
      {
        org_id: orgId,
        name: row.name!.trim(),
        client_name: row.client_name?.trim() || null,
        status: row.status || 'active',
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        budget: row.budget ?? null,
      },
      { onConflict: 'org_id,name', ignoreDuplicates: false },
    );

    if (error) {
      result.errors.push({ row: i, message: error.message });
      result.skipped++;
    } else {
      result.imported++;
    }
  }

  return result;
}

export async function importInvoices(
  supabase: SupabaseClient,
  orgId: string,
  data: InvoiceRow[],
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const err = validateInvoice(row, i);
    if (err) {
      result.errors.push({ row: i, message: err });
      result.skipped++;
      continue;
    }

    const { error } = await supabase.from('invoices').insert({
      org_id: orgId,
      contact_email: row.contact_email || null,
      amount: row.amount,
      currency: row.currency || 'AUD',
      due_date: row.due_date,
      status: row.status || 'draft',
      description: row.description || null,
    });

    if (error) {
      result.errors.push({ row: i, message: error.message });
      result.skipped++;
    } else {
      result.imported++;
    }
  }

  return result;
}
