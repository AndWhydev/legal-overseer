-- Add sendblue and other missing channel types to CHECK constraints.

-- Expand channel_messages CHECK to include all registered channel types
ALTER TABLE channel_messages DROP CONSTRAINT IF EXISTS channel_messages_channel_check;
ALTER TABLE channel_messages ADD CONSTRAINT channel_messages_channel_check
  CHECK (channel IN (
    'gmail', 'outlook', 'whatsapp', 'asana', 'calendly', 'stripe',
    'imessage', 'calendar', 'reminders', 'gsc', 'telegram', 'clickup',
    'ga4', 'wordpress', 'cluely', 'facebook', 'xero', 'instagram',
    'sms', 'sendblue', 'slack'
  ));

-- Expand channel_connections CHECK to match
ALTER TABLE channel_connections DROP CONSTRAINT IF EXISTS channel_connections_channel_type_check;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_channel_type_check
  CHECK (channel_type IN (
    'gmail', 'outlook', 'whatsapp', 'asana', 'calendly', 'stripe',
    'imessage', 'calendar', 'reminders', 'gsc', 'telegram', 'clickup',
    'ga4', 'wordpress', 'cluely', 'facebook', 'xero', 'instagram',
    'sms', 'sendblue', 'slack'
  ));
