// TypeScript types matching database schema

export type Lane = 'xixi' | 'allen';
export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes' | 'escalated';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type RiskLevel = 'low' | 'medium' | 'high';
export type DeliveryStatus = 'processing' | 'shipped' | 'in_transit' | 'delivered';

export interface ApprovalItem {
  id: number;
  lane: Lane;
  type: string;
  status: ItemStatus;
  priority: Priority;
  risk_level: RiskLevel;
  due_date: string | null;

  // Source content
  subject: string;
  body: string;
  sender_name: string | null;
  sender_email: string | null;

  // Customer support fields
  order_number: string | null;
  tracking_number: string | null;
  order_date: string | null;
  delivery_status: DeliveryStatus | null;
  has_shipping_insurance: boolean;

  // Content approval fields
  asset_link: string | null;
  platform: string | null;
  publish_date: string | null;

  // Metadata
  attachments: string | null; // JSON array
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  approval_item_id: number | null;
  owner: Lane;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: number;
  approval_item_id: number | null;
  action: string;
  actor: string;
  details: string | null; // JSON object
  created_at: string;
}

// Filter options for inbox queries
export interface FilterOptions {
  lane?: Lane;
  status?: ItemStatus;
  type?: string;
  priority?: Priority;
  risk_level?: RiskLevel;
  due_date_filter?: 'all' | 'overdue' | 'today' | 'this_week' | 'no_due_date';
}

// Lane counts for tab badges
export interface LaneCounts {
  xixi: number;
  allen: number;
}

// AI Analysis types

export interface AnalysisResult {
  summary: string;
  recommendation: 'approve' | 'needs_changes' | 'reject' | 'escalate';
  confidence: number; // 0-100
  reasoning: string;
  risk_flags: RiskFlag[];
  draft_response: string | null;
  questions_for_human: string[];
  suggested_tasks: SuggestedTask[];
  policies_applied: string[];
  generation_time_ms: number;
}

export interface RiskFlag {
  severity: 'low' | 'medium' | 'high';
  category: string;
  description: string;
}

export interface SuggestedTask {
  title: string;
  owner: Lane;
  due_days: number;
  description: string;
}

// Analysis record for audit
export interface AnalysisRecord {
  id: number;
  approval_item_id: number;
  version: number;
  result: AnalysisResult;
  model: string;
  created_at: string;
}
