/**
 * Onboarding Intelligence Pipeline
 *
 * Orchestrates: crawl all channels → Opus synthesis → world model ingestion.
 * This is the "holy shit" moment — BitBit goes from zero to omniscient
 * in under 2 minutes.
 */

import { logger } from '@/lib/core/logger'
import { crawlAllChannels, type CrawlProgress } from './intelligence-crawl'
import { synthesizeWorldModel, type WorldModel } from './opus-synthesis'
import { ingestWorldModel, type IngestionResult } from './world-model-ingester'
import type { SupabaseClient } from '@supabase/supabase-js'

export type OnboardingPhase =
  | { phase: 'crawling'; channel: string; status: string; count: number }
  | { phase: 'synthesizing'; messagesCount: number; channels: string }
  | { phase: 'ingesting'; progress: string }
  | { phase: 'complete'; summary: OnboardingResult }
  | { phase: 'error'; error: string }

export interface OnboardingResult {
  crawl: {
    totalMessages: number
    channelBreakdown: Record<string, number>
    crawlDurationMs: number
  }
  synthesis: {
    peopleFound: number
    projectsFound: number
    websitesFound: number
    financialsFound: number
    commitmentsFound: number
    synthesisDurationMs: number
  }
  ingestion: IngestionResult
  totalDurationMs: number
  worldModel: WorldModel
}

/**
 * Run the full onboarding intelligence pipeline.
 * Yields progress events for the UI.
 */
export async function* runOnboardingPipeline(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  opts: { monthsBack?: number; maxPerChannel?: number } = {},
): AsyncGenerator<OnboardingPhase> {
  const totalStart = Date.now()

  try {
    // Phase 1: Multi-channel crawl
    logger.info('[onboarding-pipeline] Starting crawl', { orgId })

    const crawlResult = await crawlAllChannels(supabase, orgId, {
      monthsBack: opts.monthsBack ?? 6,
      maxPerChannel: opts.maxPerChannel ?? 100,
      onProgress: (p: CrawlProgress) => {
        // Can't yield from callback, but we log for observability
        logger.info('[onboarding-pipeline] Crawl progress', p)
      },
    })

    yield {
      phase: 'crawling',
      channel: 'all',
      status: 'done',
      count: crawlResult.messages.length,
    }

    if (crawlResult.messages.length === 0) {
      yield { phase: 'error', error: 'No messages found in connected channels. Connect at least one email account first.' }
      return
    }

    // Phase 2: Opus synthesis
    const channels = Object.entries(crawlResult.channelBreakdown)
      .map(([ch, n]) => `${ch}(${n})`)
      .join(', ')

    yield {
      phase: 'synthesizing',
      messagesCount: crawlResult.messages.length,
      channels,
    }

    logger.info('[onboarding-pipeline] Starting Opus synthesis', {
      orgId, messages: crawlResult.messages.length, channels,
    })

    const synthStart = Date.now()
    const worldModel = await synthesizeWorldModel(crawlResult.messages, 200)
    const synthDuration = Date.now() - synthStart

    // Phase 3: Ingest world model
    yield { phase: 'ingesting', progress: 'Populating contacts, knowledge graph, and memories...' }

    logger.info('[onboarding-pipeline] Starting ingestion', {
      orgId,
      people: worldModel.people.length,
      projects: worldModel.projects.length,
      websites: worldModel.websitesAndDomains.length,
    })

    const ingestionResult = await ingestWorldModel(supabase, orgId, userId, worldModel)

    // Done
    const totalDuration = Date.now() - totalStart

    const result: OnboardingResult = {
      crawl: {
        totalMessages: crawlResult.messages.length,
        channelBreakdown: crawlResult.channelBreakdown,
        crawlDurationMs: crawlResult.crawlDurationMs,
      },
      synthesis: {
        peopleFound: worldModel.people.length,
        projectsFound: worldModel.projects.length,
        websitesFound: worldModel.websitesAndDomains.length,
        financialsFound: worldModel.financials.length,
        commitmentsFound: worldModel.commitments.length,
        synthesisDurationMs: synthDuration,
      },
      ingestion: ingestionResult,
      totalDurationMs: totalDuration,
      worldModel,
    }

    logger.info('[onboarding-pipeline] Pipeline complete', {
      orgId, totalDurationMs: totalDuration,
      people: worldModel.people.length,
      contacts: ingestionResult.contactsCreated,
      memories: ingestionResult.memoriesStored,
      graphNodes: ingestionResult.graphNodesCreated,
    })

    yield { phase: 'complete', summary: result }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error('[onboarding-pipeline] Pipeline failed', { orgId, error })
    yield { phase: 'error', error }
  }
}
