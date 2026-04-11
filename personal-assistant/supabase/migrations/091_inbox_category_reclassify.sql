-- Migration: Reclassify inbox messages from old 4-bucket to new 6-bucket category system
-- Old: actionable | informational | personal | spam
-- New: action_required | fyi | conversation | automated | marketing | spam

-- 1. Spam
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"spam"')
WHERE processed = true AND classification::jsonb->>'category' = 'spam'
  AND COALESCE(metadata->>'category','') != 'spam';

-- 2. Marketing
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"marketing"')
WHERE processed = true AND COALESCE(metadata->>'category','') NOT IN ('spam')
  AND (classification::jsonb->>'category' = 'newsletter' OR metadata->>'sender_type' = 'marketing');

-- 3. Automated
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"automated"')
WHERE processed = true AND COALESCE(metadata->>'category','') NOT IN ('spam', 'marketing')
  AND metadata->>'sender_type' IN ('automated', 'transactional');

-- 4. Conversation
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"conversation"')
WHERE processed = true AND COALESCE(metadata->>'category','') NOT IN ('spam', 'marketing', 'automated')
  AND classification::jsonb->>'category' = 'personal';

-- 5. Action required (composite threshold)
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"action_required"')
WHERE processed = true AND COALESCE(metadata->>'category','') NOT IN ('spam', 'marketing', 'automated', 'conversation')
  AND (
    significance >= 8
    OR (
      (CASE WHEN significance >= 6 THEN 1 ELSE 0 END)
      + (CASE WHEN (metadata->'actionability_signals'->>'score')::int >= 4 THEN 1 ELSE 0 END)
      + (CASE WHEN classification::jsonb->>'timeSensitivity' IN ('immediate', 'today') THEN 1 ELSE 0 END)
      + (CASE WHEN classification::jsonb->>'category' IN ('client', 'lead') THEN 1 ELSE 0 END)
      >= 2
    )
  );

-- 6. Everything else → fyi
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"fyi"')
WHERE processed = true AND COALESCE(metadata->>'category','') NOT IN ('spam', 'marketing', 'automated', 'conversation', 'action_required');

-- 7. Unprocessed messages → fyi default
UPDATE channel_messages SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{category}', '"fyi"')
WHERE (processed = false OR processed IS NULL) AND (metadata->>'category' IS NULL OR metadata->>'category' = '');
