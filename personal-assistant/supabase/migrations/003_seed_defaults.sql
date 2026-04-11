-- 003_seed_defaults.sql
-- Default data seeding and signup triggers

-- =============================================================================
-- SEED DEFAULT KANBAN COLUMNS
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_default_columns(org_uuid uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO kanban_columns (org_id, title, color, position) VALUES
    (org_uuid, 'Backlog',     '#7d8590', 0),
    (org_uuid, 'To Do',       '#d29922', 1),
    (org_uuid, 'In Progress', '#1f6feb', 2),
    (org_uuid, 'Review',      '#a371f7', 3),
    (org_uuid, 'Done',        '#238636', 4);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION on_organization_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_columns(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_seed_columns_on_org
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION on_organization_created();

-- =============================================================================
-- HANDLE NEW USER SIGNUP
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id uuid;
  user_name text;
BEGIN
  -- Check if user already has a profile (e.g., invited to existing org)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Extract display name from metadata or email
  user_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create a personal organization
  INSERT INTO organizations (name, slug)
  VALUES (
    user_name || '''s Workspace',
    'org-' || substr(NEW.id::text, 1, 8)
  )
  RETURNING id INTO new_org_id;

  -- Create the user profile as owner
  INSERT INTO profiles (id, org_id, display_name, role)
  VALUES (NEW.id, new_org_id, user_name, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
