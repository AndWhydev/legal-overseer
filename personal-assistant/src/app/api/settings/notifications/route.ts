import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/core/logger';

export interface NotificationPreferences {
  events: {
    new_message: boolean;
    task_assigned: boolean;
    task_due: boolean;
    invoice_paid: boolean;
    agent_action: boolean;
    weekly_digest: boolean;
  };
  channels: {
    email: boolean;
    in_app: boolean;
    push: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start_time: string;
    end_time: string;
  };
  digest_mode: 'immediate' | 'daily' | 'weekly';
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  events: {
    new_message: true,
    task_assigned: true,
    task_due: true,
    invoice_paid: true,
    agent_action: true,
    weekly_digest: false,
  },
  channels: {
    email: true,
    in_app: true,
    push: false,
  },
  quiet_hours: {
    enabled: false,
    start_time: '22:00',
    end_time: '08:00',
  },
  digest_mode: 'immediate',
};

function normalizePreferences(input: unknown): NotificationPreferences {
  if (!input || typeof input !== 'object') return DEFAULT_PREFERENCES;

  const source = input as Record<string, unknown>;

  return {
    events: {
      new_message: Boolean(source.events?.['new_message']) ?? DEFAULT_PREFERENCES.events.new_message,
      task_assigned: Boolean(source.events?.['task_assigned']) ?? DEFAULT_PREFERENCES.events.task_assigned,
      task_due: Boolean(source.events?.['task_due']) ?? DEFAULT_PREFERENCES.events.task_due,
      invoice_paid: Boolean(source.events?.['invoice_paid']) ?? DEFAULT_PREFERENCES.events.invoice_paid,
      agent_action: Boolean(source.events?.['agent_action']) ?? DEFAULT_PREFERENCES.events.agent_action,
      weekly_digest: Boolean(source.events?.['weekly_digest']) ?? DEFAULT_PREFERENCES.events.weekly_digest,
    },
    channels: {
      email: Boolean(source.channels?.['email']) ?? DEFAULT_PREFERENCES.channels.email,
      in_app: Boolean(source.channels?.['in_app']) ?? DEFAULT_PREFERENCES.channels.in_app,
      push: Boolean(source.channels?.['push']) ?? DEFAULT_PREFERENCES.channels.push,
    },
    quiet_hours: {
      enabled: Boolean(source.quiet_hours?.['enabled']) ?? DEFAULT_PREFERENCES.quiet_hours.enabled,
      start_time: String(source.quiet_hours?.['start_time']) ?? DEFAULT_PREFERENCES.quiet_hours.start_time,
      end_time: String(source.quiet_hours?.['end_time']) ?? DEFAULT_PREFERENCES.quiet_hours.end_time,
    },
    digest_mode: (
      source.digest_mode === 'immediate' ||
      source.digest_mode === 'daily' ||
      source.digest_mode === 'weekly'
        ? source.digest_mode
        : DEFAULT_PREFERENCES.digest_mode
    ) as NotificationPreferences['digest_mode'],
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    if (error) {
      logger.error('Failed to fetch notification preferences:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const preferences = normalizePreferences(profile?.notification_preferences);

    return NextResponse.json({ preferences });
  } catch (err) {
    logger.error('Unexpected error in GET /api/settings/notifications:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as unknown;
    const preferences = normalizePreferences(body);

    const { data, error } = await supabase
      .from('profiles')
      .update({ notification_preferences: preferences })
      .eq('id', user.id)
      .select('notification_preferences')
      .single();

    if (error) {
      logger.error('Failed to update notification preferences:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const updatedPreferences = normalizePreferences(data?.notification_preferences);

    logger.info('Notification preferences updated', {
      userId: user.id,
      changes: {
        digestMode: updatedPreferences.digest_mode,
        quietHoursEnabled: updatedPreferences.quiet_hours.enabled,
      },
    });

    return NextResponse.json({ preferences: updatedPreferences });
  } catch (err) {
    logger.error('Unexpected error in PUT /api/settings/notifications:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
