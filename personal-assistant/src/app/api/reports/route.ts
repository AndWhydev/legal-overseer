import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  generateMonthlyReport,
  generateAgentROIReport,
  generatePipelineReport,
} from '@/lib/reports/generator'
import { generateReportPDF } from '@/lib/reports/pdf-report'

export const dynamic = 'force-dynamic'

// POST — generate a new report
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      )
    }

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: 'User organization not found' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { report_type, period } = body as {
      report_type: 'monthly' | 'agent-roi' | 'pipeline'
      period?: { from?: string; to?: string; month?: string }
    }

    const orgId = profile.org_id

    let reportData
    switch (report_type) {
      case 'monthly': {
        const month = period?.month ?? new Date().toISOString().slice(0, 7)
        reportData = await generateMonthlyReport(supabase, orgId, month)
        break
      }
      case 'agent-roi': {
        const now = new Date()
        const from = period?.from ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
        const to = period?.to ?? now.toISOString()
        reportData = await generateAgentROIReport(supabase, orgId, { from, to })
        break
      }
      case 'pipeline':
        reportData = await generatePipelineReport(supabase, orgId)
        break
      default:
        return NextResponse.json({ error: 'Invalid report_type' }, { status: 400 })
    }

    // Generate PDF buffer
    const pdfBuffer = await generateReportPDF(reportData)
    const fileName = `reports/${orgId}/${report_type}-${Date.now()}.html`

    // Store in Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'text/html',
        upsert: false,
      })

    if (uploadError) {
      logger.error('[reports] Upload error:', uploadError)
      // Still return data even if storage fails
    }

    // Record in reports table
    const { data: record } = await supabase
      .from('generated_reports')
      .insert({
        org_id: orgId,
        report_type,
        period_from: period?.from ?? period?.month ?? null,
        period_to: period?.to ?? null,
        file_path: fileName,
        report_data: reportData,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    // Generate signed URL
    const { data: urlData } = await supabase.storage
      .from('reports')
      .createSignedUrl(fileName, 3600)

    return NextResponse.json({
      success: true,
      report_id: record?.id,
      report_type,
      url: urlData?.signedUrl ?? null,
      data: reportData,
    })
  } catch (err) {
    logger.error('[reports] Error:', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

// GET — list reports or download a specific one
export async function GET(request: Request) {
  const supabase = await createServerClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    )
  }

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Get user's org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const orgId = profile.org_id

  if (id) {
    // Download specific report
    const { data: report } = await supabase
      .from('generated_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.file_path) {
      const { data: urlData } = await supabase.storage
        .from('reports')
        .createSignedUrl(report.file_path, 3600)

      return NextResponse.json({
        ...report,
        download_url: urlData?.signedUrl ?? null,
      })
    }

    return NextResponse.json(report)
  }

  // List all reports for org
  const { data: reports } = await supabase
    .from('generated_reports')
    .select('id, report_type, period_from, period_to, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ reports: reports ?? [] })
}
