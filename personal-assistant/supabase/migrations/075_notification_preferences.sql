-- 075_notification_preferences.sql
-- Add notification preferences to profiles table

-- Add notification_preferences column if it doesn't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT jsonb_build_object(
  'events', jsonb_build_object(
    'new_message', true,
    'task_assigned', true,
    'task_due', true,
    'invoice_paid', true,
    'agent_action', true,
    'weekly_digest', false
  ),
  'channels', jsonb_build_object(
    'email', true,
    'in_app', true,
    'push', false
  ),
  'quiet_hours', jsonb_build_object(
    'enabled', false,
    'start_time', '22:00',
    'end_time', '08:00'
  ),
  'digest_mode', 'immediate'
);

-- Update existing rows to have default structure
UPDATE profiles
SET notification_preferences = jsonb_build_object(
  'events', jsonb_build_object(
    'new_message', true,
    'task_assigned', true,
    'task_due', true,
    'invoice_paid', true,
    'agent_action', true,
    'weekly_digest', false
  ),
  'channels', jsonb_build_object(
    'email', true,
    'in_app', true,
    'push', false
  ),
  'quiet_hours', jsonb_build_object(
    'enabled', false,
    'start_time', '22:00',
    'end_time', '08:00'
  ),
  'digest_mode', 'immediate'
)
WHERE notification_preferences IS NULL OR notification_preferences = '{}'::jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_notification_prefs
  ON profiles USING GIN (notification_preferences);
