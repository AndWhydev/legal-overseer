import { WatchManager } from '../../../components/sentry/watch-manager'

export default function SentryDashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Sentry Operations</h1>
        <p className="text-sm text-muted-foreground">
          Create and tune watches, then acknowledge active alerts to control escalation flow.
        </p>
      </header>
      <WatchManager />
    </div>
  )
}
