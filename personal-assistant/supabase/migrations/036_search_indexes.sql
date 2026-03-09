-- 036: Full-text search indexes for global search
-- Adds tsvector columns + GIN indexes + auto-update triggers

-- ─── Contacts ───────────────────────────────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING GIN (search_vector);

CREATE OR REPLACE FUNCTION contacts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.slug, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.emails, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_search_vector ON contacts;
CREATE TRIGGER trg_contacts_search_vector
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_search_vector_update();

-- Backfill existing rows
UPDATE contacts SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(slug, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(array_to_string(emails, ' '), '')), 'C');

-- ─── Leads ──────────────────────────────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_leads_search ON leads USING GIN (search_vector);

CREATE OR REPLACE FUNCTION leads_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.source_channel, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.source_detail, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_search_vector ON leads;
CREATE TRIGGER trg_leads_search_vector
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_search_vector_update();

UPDATE leads SET search_vector =
  setweight(to_tsvector('english', coalesce(source_channel, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(source_detail, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'B');

-- ─── Invoices ───────────────────────────────────────────────────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_invoices_search ON invoices USING GIN (search_vector);

CREATE OR REPLACE FUNCTION invoices_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.invoice_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.currency, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.payment_method, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_search_vector ON invoices;
CREATE TRIGGER trg_invoices_search_vector
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_search_vector_update();

UPDATE invoices SET search_vector =
  setweight(to_tsvector('english', coalesce(invoice_number, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(currency, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(payment_method, '')), 'C');

-- ─── Proposals ──────────────────────────────────────────────────────────────

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_proposals_search ON proposals USING GIN (search_vector);

CREATE OR REPLACE FUNCTION proposals_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.selected_tier, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposals_search_vector ON proposals;
CREATE TRIGGER trg_proposals_search_vector
  BEFORE INSERT OR UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION proposals_search_vector_update();

UPDATE proposals SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(selected_tier, '')), 'C');

-- ─── Tenders ────────────────────────────────────────────────────────────────

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_tenders_search ON tenders USING GIN (search_vector);

CREATE OR REPLACE FUNCTION tenders_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.source, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.url, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenders_search_vector ON tenders;
CREATE TRIGGER trg_tenders_search_vector
  BEFORE INSERT OR UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION tenders_search_vector_update();

UPDATE tenders SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(source, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(url, '')), 'C');
