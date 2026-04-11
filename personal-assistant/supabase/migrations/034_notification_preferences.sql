-- Add notification preferences to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"email": true, "whatsapp": true, "dashboard": true, "digest_frequency": "daily"}'::jsonb;

COMMENT ON COLUMN profiles.notification_preferences IS 'User notification channel preferences and digest frequency';
