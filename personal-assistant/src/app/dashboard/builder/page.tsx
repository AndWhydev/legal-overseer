import { ProjectList } from '@/components/builder/project-list'

export default function BuilderPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-medium">Website Builder</h1>
        <p className="text-sm text-muted-foreground">
          Manage your generated websites, preview staging sites, and deploy to WordPress.
        </p>
      </div>
      <ProjectList />
    </div>
  )
}
