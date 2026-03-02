import { withCronGuard } from '@/lib/cron/cron-guard'
import { generateMonthlyReport } from '@/lib/reports/generator'
import { generateReportPDF } from '@/lib/reports/pdf-report'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    const now = new Date()
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const month = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('status', 'active')

    const results: { orgId: string; success: boolean; error?: string }[] = []

    for (const org of orgs ?? []) {
      try {
        const reportData = await generateMonthlyReport(supabase, org.id, month)
        const pdfBuffer = await generateReportPDF(reportData, org.name)
        const fileName = `reports/${org.id}/monthly-${month}.html`

        await supabase.storage
          .from('reports')
          .upload(fileName, pdfBuffer, { contentType: 'text/html', upsert: true })

        await supabase.from('generated_reports').insert({
          org_id: org.id,
          report_type: 'monthly',
          period_from: month,
          file_path: fileName,
          report_data: reportData,
          created_at: new Date().toISOString(),
        })

        await supabase.from('notifications').insert({
          org_id: org.id,
          type: 'info',
          title: `Monthly Report Ready: ${month}`,
          body: `Your monthly summary report for ${month} has been generated and is ready to view in the Reports tab.`,
          urgency: 'normal',
          created_at: new Date().toISOString(),
        })

        results.push({ orgId: org.id, success: true })
      } catch (err) {
        console.error(`[cron/monthly-report] Error for org ${org.id}:`, err)
        results.push({ orgId: org.id, success: false, error: String(err) })
      }
    }

    return {
      message: `Monthly report generation complete for ${month}`,
      details: {
        month,
        orgsProcessed: results.length,
        successes: results.filter((r) => r.success).length,
        failures: results.filter((r) => !r.success).length,
        results,
      },
    }
  })
}
