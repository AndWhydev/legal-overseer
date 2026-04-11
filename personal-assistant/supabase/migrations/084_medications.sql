-- 084_medications.sql
-- Medications persistence — stores user medications and daily dose tracking

CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  dosage TEXT,
  dose_mg NUMERIC,
  frequency TEXT,
  category TEXT DEFAULT 'prescription',
  instructions TEXT,
  refill_date DATE,
  prescriber TEXT,
  pharmacy TEXT,
  notes TEXT,
  pill_style JSONB,
  half_life_hours NUMERIC,
  peak_hours NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_medications_user ON medications(user_id);
CREATE INDEX idx_medications_org ON medications(org_id);
CREATE INDEX idx_medications_active ON medications(user_id) WHERE is_active = true;

ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own medications" ON medications
  FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER trg_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Daily dose tracking
CREATE TABLE IF NOT EXISTS medication_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  doses INTEGER NOT NULL DEFAULT 1,
  taken BOOLEAN DEFAULT false,
  taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_medication_doses_user_date ON medication_doses(user_id, scheduled_date);
CREATE INDEX idx_medication_doses_medication ON medication_doses(medication_id);

ALTER TABLE medication_doses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own doses" ON medication_doses
  FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER trg_medication_doses_updated_at
  BEFORE UPDATE ON medication_doses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
