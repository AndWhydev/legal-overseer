'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card';

export interface ApprovalItem {
  id: string;
  action_summary: string;
  action_type: string;
  confidence_score: number;
  routing_decision: 'ask' | 'escalate';
  priority: 'urgent' | 'normal' | 'low';
  created_at: string;
  context_snapshot: Record<string, unknown>;
  agent_name?: string | null;
}

interface ApprovalCardProps {
  approval: ApprovalItem;
  isResolving?: boolean;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}

const relTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelativeTime(timestamp: string): string {
  const createdAt = new Date(timestamp).getTime();
  const deltaSec = Math.round((createdAt - Date.now()) / 1000);
  const absSec = Math.abs(deltaSec);

  if (absSec < 60) return relTime.format(deltaSec, 'second');

  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return relTime.format(deltaMin, 'minute');

  const deltaHour = Math.round(deltaMin / 60);
  if (Math.abs(deltaHour) < 24) return relTime.format(deltaHour, 'hour');

  const deltaDay = Math.round(deltaHour / 24);
  return relTime.format(deltaDay, 'day');
}

function confidenceClass(confidence: number): string {
  if (confidence < 0.55) return 'bg-destructive/15 text-destructive border-destructive/20';
  if (confidence <= 0.85) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-success/15 text-success border-success/20';
}

function priorityClass(priority: ApprovalItem['priority']): string {
  if (priority === 'urgent') return 'bg-destructive/15 text-destructive border-destructive/20';
  if (priority === 'normal') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

function toPrettyLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractContext(approval: ApprovalItem): Array<{ label: string; value: string }> {
  const snapshot = approval.context_snapshot ?? {};

  const candidates: Array<[string, unknown]> = [
    ['Contact', snapshot.contact_name ?? snapshot.contactName],
    ['Project', snapshot.project_name ?? snapshot.projectName ?? snapshot.project],
    ['Amount', snapshot.amount_formatted ?? snapshot.amount],
    ['Invoice', snapshot.invoice_number ?? snapshot.invoiceNumber],
  ];

  return candidates
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim().length > 0)
    .map(([label, value]) => ({ label, value: String(value) }));
}

export function ApprovalCard({ approval, isResolving = false, onApprove, onReject }: ApprovalCardProps) {
  const contextRows = extractContext(approval);
  const confidencePct = Math.round(approval.confidence_score * 100);

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{approval.agent_name ?? 'Agent'}</Badge>
          <Badge className={confidenceClass(approval.confidence_score)}>{confidencePct}% confidence</Badge>
          <Badge className={priorityClass(approval.priority)}>{toPrettyLabel(approval.priority)}</Badge>
          <Badge variant="outline">{toPrettyLabel(approval.routing_decision)}</Badge>
        </div>

        <div className="space-y-1">
          <CardTitle className="text-base leading-snug">{approval.action_summary}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {toPrettyLabel(approval.action_type)} · {formatRelativeTime(approval.created_at)}
          </p>
        </div>
      </CardHeader>

      {contextRows.length > 0 ? (
        <CardContent className="space-y-2 px-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Context</p>
          <dl className="grid gap-1 text-sm">
            {contextRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      ) : null}

      <CardFooter className="gap-2 px-4 pt-0">
        <Button className="flex-1" disabled={isResolving} onClick={() => onApprove(approval.id)}>
          {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Approve
        </Button>
        <Button
          className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          variant="outline"
          disabled={isResolving}
          onClick={() => onReject(approval.id)}
        >
          {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Reject
        </Button>
      </CardFooter>
    </Card>
  );
}
