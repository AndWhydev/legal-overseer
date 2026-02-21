import { ApprovalQueue } from '@/components/dashboard/approval-queue'

export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Approval Queue</h1>
      <ApprovalQueue />
    </div>
  )
}
