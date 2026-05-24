/**
 * Migration 015: Comprehensive feature buildout.
 *
 * Adds tables needed for Sections 1-9 of the comprehensive paralegal
 * replacement buildout: intelligence, document management, client and
 * matter management, compliance, collaboration, analytics,
 * integrations, paralegal-replacement, and enterprise features.
 *
 * Single migration so a firm picks up the entire feature set on one
 * restart.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '015_comprehensive_features',
  up: (db: Database) => {
    // ============================================================
    // Section 1: Intelligence
    // ============================================================

    db.exec(`
      CREATE TABLE outcome_analyses (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        win_probability REAL,
        lose_probability REAL,
        settle_probability REAL,
        settlement_min_aud REAL,
        settlement_max_aud REAL,
        litigation_risk_score INTEGER CHECK (litigation_risk_score BETWEEN 1 AND 10),
        risk_factors_json TEXT,
        recommended_approach TEXT,
        analysis_markdown TEXT NOT NULL,
        precedent_ids TEXT,
        austlii_refs TEXT,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_outcome_matter ON outcome_analyses(matter_id)`);
    logger.info('Created table: outcome_analyses');

    db.exec(`
      CREATE TABLE matter_strategies (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        body_markdown TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
        review_id TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_strategy_matter ON matter_strategies(matter_id)`);
    db.exec(`CREATE INDEX idx_strategy_status ON matter_strategies(status)`);
    logger.info('Created table: matter_strategies');

    db.exec(`
      CREATE TABLE deposition_preps (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        witness_name TEXT NOT NULL,
        source_document_id TEXT,
        body_markdown TEXT NOT NULL,
        review_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_depo_matter ON deposition_preps(matter_id)`);
    logger.info('Created table: deposition_preps');

    db.exec(`
      CREATE TABLE contract_negotiations (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        contract_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'executed', 'abandoned')),
        client_position TEXT,
        opposing_position TEXT,
        summary_markdown TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_negotiation_matter ON contract_negotiations(matter_id)`);
    logger.info('Created table: contract_negotiations');

    db.exec(`
      CREATE TABLE contract_versions (
        id TEXT PRIMARY KEY,
        negotiation_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        document_id TEXT NOT NULL,
        uploaded_by TEXT,
        from_party TEXT,
        notes TEXT,
        changes_summary TEXT,
        added_clauses_json TEXT,
        removed_clauses_json TEXT,
        modified_clauses_json TEXT,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (negotiation_id) REFERENCES contract_negotiations(id)
      )
    `);
    db.exec(`CREATE INDEX idx_cv_negotiation ON contract_versions(negotiation_id)`);
    db.exec(`CREATE UNIQUE INDEX idx_cv_version ON contract_versions(negotiation_id, version_number)`);
    logger.info('Created table: contract_versions');

    db.exec(`
      CREATE TABLE fee_benchmarks (
        id TEXT PRIMARY KEY,
        matter_type TEXT NOT NULL,
        complexity TEXT NOT NULL CHECK (complexity IN ('simple', 'medium', 'complex')),
        jurisdiction TEXT NOT NULL DEFAULT 'NSW',
        low_aud REAL NOT NULL,
        median_aud REAL NOT NULL,
        high_aud REAL NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT,
        as_of_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_fee_bench_type ON fee_benchmarks(matter_type, jurisdiction)`);
    logger.info('Created table: fee_benchmarks');

    db.exec(`
      CREATE TABLE jurisdiction_comparisons (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        jurisdictions_json TEXT NOT NULL,
        comparison_markdown TEXT NOT NULL,
        recommended_jurisdiction TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_jur_comp_matter ON jurisdiction_comparisons(matter_id)`);
    logger.info('Created table: jurisdiction_comparisons');

    db.exec(`
      CREATE TABLE plain_english_explainers (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        source_document_id TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        review_id TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_plain_eng_matter ON plain_english_explainers(matter_id)`);
    logger.info('Created table: plain_english_explainers');

    // ============================================================
    // Section 2: Document & Knowledge Management
    // ============================================================

    db.exec(`
      CREATE TABLE document_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        matter_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        stored_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        change_summary TEXT,
        modified_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_doc_ver_doc ON document_versions(document_id)`);
    db.exec(`CREATE UNIQUE INDEX idx_doc_ver_num ON document_versions(document_id, version_number)`);
    logger.info('Created table: document_versions');

    db.exec(`
      CREATE TABLE document_classifications (
        document_id TEXT PRIMARY KEY,
        matter_id TEXT,
        document_type TEXT NOT NULL,
        practice_area TEXT,
        suggested_matter_id TEXT,
        urgency TEXT CHECK (urgency IN ('routine', 'priority', 'urgent')),
        has_deadlines INTEGER NOT NULL DEFAULT 0 CHECK (has_deadlines IN (0, 1)),
        extracted_deadlines_json TEXT,
        confidence REAL NOT NULL,
        classified_by TEXT NOT NULL,
        corrected_by TEXT,
        corrected_at TEXT,
        classified_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_doc_class_type ON document_classifications(document_type)`);
    logger.info('Created table: document_classifications');

    db.exec(`
      CREATE TABLE document_embeddings (
        id TEXT PRIMARY KEY,
        ref_kind TEXT NOT NULL
          CHECK (ref_kind IN ('matter', 'document', 'email', 'note', 'precedent', 'knowledge')),
        ref_id TEXT NOT NULL,
        matter_id TEXT,
        snippet TEXT NOT NULL,
        title TEXT,
        token_vec TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_emb_ref ON document_embeddings(ref_kind, ref_id)`);
    db.exec(`CREATE INDEX idx_emb_matter ON document_embeddings(matter_id)`);
    logger.info('Created table: document_embeddings');

    db.exec(`
      CREATE TABLE search_history (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        query TEXT NOT NULL,
        result_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_search_user ON search_history(user_email)`);
    logger.info('Created table: search_history');

    db.exec(`
      CREATE TABLE knowledge_entries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        kind TEXT NOT NULL
          CHECK (kind IN ('know_how', 'research_memo', 'practice_note', 'procedure', 'lesson', 'policy')),
        practice_area TEXT,
        matter_type TEXT,
        jurisdiction TEXT,
        tags TEXT,
        is_firm_policy INTEGER NOT NULL DEFAULT 0 CHECK (is_firm_policy IN (0, 1)),
        author_email TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_know_kind ON knowledge_entries(kind)`);
    db.exec(`CREATE INDEX idx_know_pa ON knowledge_entries(practice_area)`);
    logger.info('Created table: knowledge_entries');

    db.exec(`
      CREATE TABLE knowledge_versions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        body_markdown TEXT NOT NULL,
        change_note TEXT,
        author_email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
      )
    `);
    db.exec(`CREATE UNIQUE INDEX idx_know_ver ON knowledge_versions(entry_id, version_number)`);
    logger.info('Created table: knowledge_versions');

    db.exec(`
      CREATE TABLE clauses (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        clause_type TEXT NOT NULL,
        practice_area TEXT,
        jurisdiction TEXT,
        risk_profile TEXT CHECK (risk_profile IN ('low', 'medium', 'high')),
        approved_text TEXT NOT NULL,
        usage_notes TEXT,
        alternatives_json TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_clause_type ON clauses(clause_type)`);
    db.exec(`CREATE INDEX idx_clause_pa ON clauses(practice_area)`);
    logger.info('Created table: clauses');

    db.exec(`
      CREATE TABLE redline_comparisons (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        left_doc_label TEXT NOT NULL,
        right_doc_label TEXT NOT NULL,
        added_count INTEGER NOT NULL,
        removed_count INTEGER NOT NULL,
        modified_count INTEGER NOT NULL,
        html_path TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_redline_matter ON redline_comparisons(matter_id)`);
    logger.info('Created table: redline_comparisons');

    // ============================================================
    // Section 3: Client & Matter Management
    // ============================================================

    db.exec(`
      CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        company_name TEXT,
        abn TEXT,
        client_type TEXT NOT NULL DEFAULT 'individual'
          CHECK (client_type IN ('individual', 'company', 'trust', 'government')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('prospect', 'active', 'closed')),
        relationship_partner_email TEXT,
        referral_source TEXT,
        referring_client_id TEXT,
        referring_professional TEXT,
        identity_verified INTEGER NOT NULL DEFAULT 0 CHECK (identity_verified IN (0, 1)),
        identity_verified_at TEXT,
        identity_verified_by TEXT,
        engagement_letter_signed_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_clients_email ON clients(email)`);
    db.exec(`CREATE INDEX idx_clients_status ON clients(status)`);
    db.exec(`CREATE INDEX idx_clients_partner ON clients(relationship_partner_email)`);
    logger.info('Created table: clients');

    db.exec(`
      CREATE TABLE client_health_scores (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
        payment_score INTEGER NOT NULL,
        responsiveness_score INTEGER NOT NULL,
        complexity_trend_score INTEGER NOT NULL,
        relationship_length_score INTEGER NOT NULL,
        satisfaction_score INTEGER NOT NULL,
        breakdown_json TEXT NOT NULL,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);
    db.exec(`CREATE INDEX idx_chs_client ON client_health_scores(client_id, computed_at)`);
    logger.info('Created table: client_health_scores');

    db.exec(`
      CREATE TABLE client_onboardings (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'started'
          CHECK (status IN ('started', 'conflict_check', 'engagement_letter', 'awaiting_signature',
                            'awaiting_identity', 'awaiting_lawyer', 'completed', 'failed', 'cancelled')),
        conflict_check_id TEXT,
        engagement_letter_review_id TEXT,
        engagement_letter_signature_id TEXT,
        identity_verification_id TEXT,
        matter_id TEXT,
        failure_reason TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);
    db.exec(`CREATE INDEX idx_onboard_client ON client_onboardings(client_id)`);
    db.exec(`CREATE INDEX idx_onboard_status ON client_onboardings(status)`);
    logger.info('Created table: client_onboardings');

    db.exec(`
      CREATE TABLE signature_envelopes (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        document_id TEXT NOT NULL,
        document_title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent'
          CHECK (status IN ('draft', 'sent', 'completed', 'declined', 'voided', 'expired')),
        created_by TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'builtin'
          CHECK (provider IN ('builtin', 'docusign')),
        provider_envelope_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
    db.exec(`CREATE INDEX idx_env_matter ON signature_envelopes(matter_id)`);
    db.exec(`CREATE INDEX idx_env_status ON signature_envelopes(status)`);
    logger.info('Created table: signature_envelopes');

    db.exec(`
      CREATE TABLE signature_signers (
        id TEXT PRIMARY KEY,
        envelope_id TEXT NOT NULL,
        signer_name TEXT NOT NULL,
        signer_email TEXT NOT NULL,
        role TEXT NOT NULL,
        signing_token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'signed', 'declined')),
        signed_at TEXT,
        signed_ip TEXT,
        signature_data TEXT,
        last_reminded_at TEXT,
        reminder_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (envelope_id) REFERENCES signature_envelopes(id)
      )
    `);
    db.exec(`CREATE INDEX idx_signer_env ON signature_signers(envelope_id)`);
    db.exec(`CREATE INDEX idx_signer_token ON signature_signers(signing_token)`);
    logger.info('Created table: signature_signers');

    db.exec(`
      CREATE TABLE satisfaction_surveys (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        client_id TEXT,
        survey_token TEXT NOT NULL UNIQUE,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        responded_at TEXT,
        overall_satisfaction INTEGER CHECK (overall_satisfaction BETWEEN 1 AND 5),
        communication_quality INTEGER CHECK (communication_quality BETWEEN 1 AND 5),
        value_for_money INTEGER CHECK (value_for_money BETWEEN 1 AND 5),
        likelihood_to_recommend INTEGER CHECK (likelihood_to_recommend BETWEEN 0 AND 10),
        open_feedback TEXT,
        flagged_for_review INTEGER NOT NULL DEFAULT 0 CHECK (flagged_for_review IN (0, 1)),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_survey_matter ON satisfaction_surveys(matter_id)`);
    db.exec(`CREATE INDEX idx_survey_token ON satisfaction_surveys(survey_token)`);
    logger.info('Created table: satisfaction_surveys');

    db.exec(`
      CREATE TABLE matter_budgets (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL UNIQUE,
        estimated_hours REAL NOT NULL,
        estimated_disbursements_aud REAL NOT NULL,
        estimated_total_aud REAL NOT NULL,
        notes TEXT,
        set_by TEXT NOT NULL,
        alert_75_sent_at TEXT,
        alert_90_sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    logger.info('Created table: matter_budgets');

    db.exec(`
      CREATE TABLE matter_disbursements (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_aud REAL NOT NULL,
        category TEXT,
        incurred_at TEXT NOT NULL DEFAULT (datetime('now')),
        recorded_by TEXT NOT NULL,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_disb_matter ON matter_disbursements(matter_id)`);
    logger.info('Created table: matter_disbursements');

    // ============================================================
    // Section 4: Compliance and Risk
    // ============================================================

    db.exec(`
      CREATE TABLE aml_screenings (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        screened_against_json TEXT NOT NULL,
        matches_json TEXT NOT NULL,
        match_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'clear'
          CHECK (status IN ('clear', 'flagged', 'cleared_by_review', 'blocked')),
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_note TEXT,
        screened_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);
    db.exec(`CREATE INDEX idx_aml_client ON aml_screenings(client_id)`);
    db.exec(`CREATE INDEX idx_aml_status ON aml_screenings(status)`);
    logger.info('Created table: aml_screenings');

    db.exec(`
      CREATE TABLE pi_risk_assessments (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 1 AND 10),
        risk_factors_json TEXT NOT NULL,
        mitigation_steps TEXT NOT NULL,
        senior_review_flagged INTEGER NOT NULL DEFAULT 0 CHECK (senior_review_flagged IN (0, 1)),
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_pi_matter ON pi_risk_assessments(matter_id, computed_at)`);
    logger.info('Created table: pi_risk_assessments');

    db.exec(`
      CREATE TABLE regulatory_calendar_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT NOT NULL,
        jurisdiction TEXT,
        applies_to_user_id TEXT,
        applies_to_role TEXT,
        due_date TEXT NOT NULL,
        recurring TEXT,
        last_reminder_offset INTEGER,
        completed_at TEXT,
        completed_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_reg_cal_due ON regulatory_calendar_events(due_date)`);
    db.exec(`CREATE INDEX idx_reg_cal_user ON regulatory_calendar_events(applies_to_user_id)`);
    logger.info('Created table: regulatory_calendar_events');

    db.exec(`
      CREATE TABLE file_review_schedules (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL UNIQUE,
        review_interval_days INTEGER NOT NULL,
        last_reviewed_at TEXT,
        last_reviewed_by TEXT,
        last_review_note TEXT,
        next_due_at TEXT NOT NULL,
        escalated_at TEXT,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_file_review_due ON file_review_schedules(next_due_at)`);
    logger.info('Created table: file_review_schedules');

    db.exec(`
      CREATE TABLE costs_disclosure_checks (
        id TEXT PRIMARY KEY,
        engagement_letter_review_id TEXT,
        matter_id TEXT,
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        missing_elements_json TEXT,
        jurisdiction TEXT,
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_costs_matter ON costs_disclosure_checks(matter_id)`);
    logger.info('Created table: costs_disclosure_checks');

    db.exec(`
      CREATE TABLE trust_transactions (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'transfer', 'interest', 'fee')),
        amount_aud REAL NOT NULL,
        reference TEXT,
        description TEXT,
        bank_transaction_id TEXT,
        transaction_date TEXT NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        reconciled_at TEXT,
        reconciled_by TEXT,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_trust_matter ON trust_transactions(matter_id)`);
    db.exec(`CREATE INDEX idx_trust_date ON trust_transactions(transaction_date)`);
    logger.info('Created table: trust_transactions');

    db.exec(`
      CREATE TABLE trust_reconciliations (
        id TEXT PRIMARY KEY,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        opening_balance_aud REAL NOT NULL,
        closing_balance_aud REAL NOT NULL,
        total_deposits_aud REAL NOT NULL,
        total_withdrawals_aud REAL NOT NULL,
        unmatched_count INTEGER NOT NULL DEFAULT 0,
        report_markdown TEXT NOT NULL,
        signed_off_by TEXT,
        signed_off_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: trust_reconciliations');

    // ============================================================
    // Section 5: Communication & Collaboration
    // ============================================================

    db.exec(`
      CREATE TABLE matter_chat_messages (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        author_email TEXT NOT NULL,
        body TEXT NOT NULL,
        mentions_json TEXT,
        attached_doc_ids TEXT,
        is_action_item INTEGER NOT NULL DEFAULT 0 CHECK (is_action_item IN (0, 1)),
        action_assignee TEXT,
        action_due_date TEXT,
        action_completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_chat_matter ON matter_chat_messages(matter_id, created_at)`);
    db.exec(`CREATE INDEX idx_chat_assignee ON matter_chat_messages(action_assignee)`);
    logger.info('Created table: matter_chat_messages');

    db.exec(`
      CREATE TABLE external_counsel_briefs (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        counsel_name TEXT NOT NULL,
        counsel_email TEXT NOT NULL,
        chambers TEXT,
        instructing_lawyer_email TEXT NOT NULL,
        access_token TEXT NOT NULL UNIQUE,
        instructions_markdown TEXT NOT NULL,
        shared_document_ids TEXT,
        download_allowed INTEGER NOT NULL DEFAULT 0 CHECK (download_allowed IN (0, 1)),
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_ec_token ON external_counsel_briefs(access_token)`);
    db.exec(`CREATE INDEX idx_ec_matter ON external_counsel_briefs(matter_id)`);
    logger.info('Created table: external_counsel_briefs');

    db.exec(`
      CREATE TABLE external_counsel_access_log (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL,
        action TEXT NOT NULL,
        document_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (brief_id) REFERENCES external_counsel_briefs(id)
      )
    `);
    db.exec(`CREATE INDEX idx_ec_log_brief ON external_counsel_access_log(brief_id)`);
    logger.info('Created table: external_counsel_access_log');

    db.exec(`
      CREATE TABLE external_counsel_uploads (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        stored_path TEXT NOT NULL,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (brief_id) REFERENCES external_counsel_briefs(id)
      )
    `);
    logger.info('Created table: external_counsel_uploads');

    db.exec(`
      CREATE TABLE calendar_sync_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'ics')),
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TEXT,
        ics_feed_token TEXT,
        calendar_id TEXT,
        last_sync_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    logger.info('Created table: calendar_sync_configs');

    db.exec(`
      CREATE TABLE calendar_sync_events (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('deadline', 'regulatory', 'reminder')),
        source_id TEXT NOT NULL,
        provider_event_id TEXT,
        last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
      )
    `);
    db.exec(`CREATE UNIQUE INDEX idx_cse_source ON calendar_sync_events(config_id, source_kind, source_id)`);
    logger.info('Created table: calendar_sync_events');

    db.exec(`
      CREATE TABLE file_notes (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        author_email TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('meeting', 'phone_call', 'dictation', 'other')),
        body_markdown TEXT NOT NULL,
        review_id TEXT,
        audio_path TEXT,
        transcription_source TEXT,
        action_items_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_fnote_matter ON file_notes(matter_id, created_at)`);
    logger.info('Created table: file_notes');

    db.exec(`
      CREATE TABLE sms_messages (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        client_id TEXT,
        to_number TEXT NOT NULL,
        from_number TEXT,
        body TEXT NOT NULL,
        review_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'blocked')),
        provider_sid TEXT,
        sent_at TEXT,
        delivered_at TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_sms_matter ON sms_messages(matter_id)`);
    db.exec(`CREATE INDEX idx_sms_status ON sms_messages(status)`);
    logger.info('Created table: sms_messages');

    db.exec(`
      CREATE TABLE sms_opt_outs (
        phone TEXT PRIMARY KEY,
        opted_out_at TEXT NOT NULL DEFAULT (datetime('now')),
        reason TEXT
      )
    `);
    logger.info('Created table: sms_opt_outs');

    // ============================================================
    // Section 6: Analytics
    // ============================================================

    db.exec(`
      CREATE TABLE client_invoice_payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        amount_aud REAL NOT NULL,
        payment_date TEXT NOT NULL,
        method TEXT,
        reference TEXT,
        recorded_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_cinv_pay_invoice ON client_invoice_payments(invoice_id)`);
    logger.info('Created table: client_invoice_payments');

    db.exec(`
      CREATE TABLE market_intelligence_reports (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        sections_json TEXT,
        generated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_mir_period ON market_intelligence_reports(period)`);
    logger.info('Created table: market_intelligence_reports');

    db.exec(`
      CREATE TABLE competitors (
        id TEXT PRIMARY KEY,
        firm_name TEXT NOT NULL UNIQUE,
        website TEXT,
        linkedin_url TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: competitors');

    db.exec(`
      CREATE TABLE competitor_reports (
        id TEXT PRIMARY KEY,
        competitor_id TEXT NOT NULL,
        period TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        observations_json TEXT,
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (competitor_id) REFERENCES competitors(id)
      )
    `);
    db.exec(`CREATE INDEX idx_comp_report ON competitor_reports(competitor_id, period)`);
    logger.info('Created table: competitor_reports');

    // ============================================================
    // Section 7: Integrations
    // ============================================================

    db.exec(`
      CREATE TABLE integration_configs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL UNIQUE,
        config_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        last_synced_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: integration_configs');

    db.exec(`
      CREATE TABLE xero_sync_log (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('invoice', 'payment', 'trust_transaction')),
        local_id TEXT NOT NULL,
        xero_id TEXT,
        direction TEXT NOT NULL CHECK (direction IN ('to_xero', 'from_xero')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed')),
        error_message TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_xero_local ON xero_sync_log(kind, local_id)`);
    logger.info('Created table: xero_sync_log');

    db.exec(`
      CREATE TABLE teams_notifications (
        id TEXT PRIMARY KEY,
        event_kind TEXT NOT NULL,
        ref_table TEXT,
        ref_id TEXT,
        payload_json TEXT NOT NULL,
        delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'failed')),
        sent_at TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_teams_status ON teams_notifications(delivery_status)`);
    logger.info('Created table: teams_notifications');

    db.exec(`
      CREATE TABLE webhook_events (
        id TEXT PRIMARY KEY,
        api_key_id TEXT,
        event_kind TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
        endpoint TEXT,
        payload_json TEXT NOT NULL,
        response_status INTEGER,
        delivered_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_wh_kind ON webhook_events(event_kind, created_at)`);
    logger.info('Created table: webhook_events');

    db.exec(`
      CREATE TABLE webhook_subscriptions (
        id TEXT PRIMARY KEY,
        api_key_id TEXT NOT NULL,
        event_kind TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        secret TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_wh_sub_kind ON webhook_subscriptions(event_kind)`);
    logger.info('Created table: webhook_subscriptions');

    db.exec(`
      CREATE TABLE backup_runs (
        id TEXT PRIMARY KEY,
        destination TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'verified')),
        bytes_written INTEGER,
        encrypted INTEGER NOT NULL DEFAULT 1 CHECK (encrypted IN (0, 1)),
        encryption_key_id TEXT,
        archive_path TEXT,
        archive_sha256 TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        error_message TEXT,
        verification_result TEXT
      )
    `);
    db.exec(`CREATE INDEX idx_backup_started ON backup_runs(started_at)`);
    logger.info('Created table: backup_runs');

    // ============================================================
    // Section 8: Paralegal Replacement
    // ============================================================

    db.exec(`
      CREATE TABLE lawyer_email_configs (
        user_id TEXT PRIMARY KEY,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_user TEXT NOT NULL,
        smtp_password_encrypted TEXT NOT NULL,
        smtp_secure INTEGER NOT NULL DEFAULT 1 CHECK (smtp_secure IN (0, 1)),
        from_address TEXT NOT NULL,
        from_name TEXT,
        verified_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    logger.info('Created table: lawyer_email_configs');

    db.exec(`
      CREATE TABLE outbound_emails (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        client_id TEXT,
        review_id TEXT NOT NULL UNIQUE,
        sent_by TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_addresses TEXT NOT NULL,
        cc_addresses TEXT,
        subject TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        attachment_ids TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
        message_id TEXT,
        sent_at TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_outbound_matter ON outbound_emails(matter_id)`);
    db.exec(`CREATE INDEX idx_outbound_status ON outbound_emails(status)`);
    logger.info('Created table: outbound_emails');

    db.exec(`
      CREATE TABLE document_requests (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        client_id TEXT,
        client_email TEXT NOT NULL,
        documents_requested TEXT NOT NULL,
        deadline_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'partially_received', 'completed', 'cancelled')),
        request_email_review_id TEXT,
        reminder_3day_review_id TEXT,
        reminder_7day_review_id TEXT,
        escalated_at TEXT,
        completed_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_docreq_matter ON document_requests(matter_id)`);
    db.exec(`CREATE INDEX idx_docreq_status ON document_requests(status)`);
    logger.info('Created table: document_requests');

    db.exec(`
      CREATE TABLE client_invoices (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        client_id TEXT,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        subtotal_aud REAL NOT NULL,
        gst_aud REAL NOT NULL,
        total_aud REAL NOT NULL,
        amount_paid_aud REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'pending_approval', 'sent', 'paid', 'overdue', 'written_off')),
        review_id TEXT,
        line_items_json TEXT NOT NULL,
        trust_balance_aud REAL,
        notes TEXT,
        sent_at TEXT,
        last_reminder_at TEXT,
        reminder_count INTEGER NOT NULL DEFAULT 0,
        xero_invoice_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_cinv_matter ON client_invoices(matter_id)`);
    db.exec(`CREATE INDEX idx_cinv_status ON client_invoices(status)`);
    db.exec(`CREATE INDEX idx_cinv_due ON client_invoices(due_date)`);
    logger.info('Created table: invoices');

    db.exec(`
      CREATE TABLE invoice_sequence (
        firm_id TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL DEFAULT 1
      )
    `);
    logger.info('Created table: invoice_sequence');

    // ============================================================
    // Section 9: Enterprise
    // ============================================================

    db.exec(`
      CREATE TABLE sso_configs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL UNIQUE CHECK (provider IN ('azure_ad', 'google_workspace')),
        config_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: sso_configs');

    db.exec(`
      CREATE TABLE sso_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        provider_email TEXT NOT NULL,
        linked_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    db.exec(`CREATE UNIQUE INDEX idx_sso_link_provider ON sso_links(provider, provider_user_id)`);
    logger.info('Created table: sso_links');

    db.exec(`
      CREATE TABLE practice_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: practice_groups');

    db.exec(`
      CREATE TABLE user_practice_groups (
        user_id TEXT NOT NULL,
        practice_group_id TEXT NOT NULL,
        PRIMARY KEY (user_id, practice_group_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (practice_group_id) REFERENCES practice_groups(id)
      )
    `);
    logger.info('Created table: user_practice_groups');

    db.exec(`
      CREATE TABLE matter_practice_groups (
        matter_id TEXT NOT NULL,
        practice_group_id TEXT NOT NULL,
        PRIMARY KEY (matter_id, practice_group_id),
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (practice_group_id) REFERENCES practice_groups(id)
      )
    `);
    logger.info('Created table: matter_practice_groups');

    db.exec(`
      CREATE TABLE matter_supervision (
        matter_id TEXT PRIMARY KEY,
        supervising_partner_email TEXT NOT NULL,
        supervision_level TEXT NOT NULL DEFAULT 'all'
          CHECK (supervision_level IN ('all', 'client_only', 'court_only')),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    logger.info('Created table: matter_supervision');

    db.exec(`
      CREATE TABLE secondary_reviews (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL UNIQUE,
        matter_id TEXT NOT NULL,
        supervisor_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'edited', 'rejected')),
        original_body TEXT,
        edited_body TEXT,
        supervisor_note TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_sec_review_status ON secondary_reviews(status)`);
    logger.info('Created table: secondary_reviews');

    db.exec(`
      CREATE TABLE bulk_imports (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('leap', 'clio', 'csv')),
        imported_by TEXT NOT NULL,
        total_rows INTEGER NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        log_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: bulk_imports');

    db.exec(`
      CREATE TABLE branding_config (
        id TEXT PRIMARY KEY,
        firm_name TEXT NOT NULL,
        logo_path TEXT,
        primary_color TEXT,
        accent_color TEXT,
        login_tagline TEXT,
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: branding_config');

    db.exec(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        created_by TEXT NOT NULL,
        scopes TEXT NOT NULL,
        rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
        last_used_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_api_key_hash ON api_keys(key_hash)`);
    logger.info('Created table: api_keys');

    db.exec(`
      CREATE TABLE api_request_log (
        id TEXT PRIMARY KEY,
        api_key_id TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_api_req_key ON api_request_log(api_key_id, created_at)`);
    logger.info('Created table: api_request_log');

    db.exec(`
      CREATE TABLE offices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT,
        phone TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    logger.info('Created table: offices');

    db.exec(`
      CREATE TABLE user_offices (
        user_id TEXT NOT NULL,
        office_id TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        PRIMARY KEY (user_id, office_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (office_id) REFERENCES offices(id)
      )
    `);
    logger.info('Created table: user_offices');

    db.exec(`
      ALTER TABLE matters ADD COLUMN office_id TEXT REFERENCES offices(id)
    `);
    logger.info('Added column matters.office_id');

    db.exec(`
      ALTER TABLE matters ADD COLUMN client_id TEXT REFERENCES clients(id)
    `);
    logger.info('Added column matters.client_id');

    db.exec(`
      CREATE TABLE monitoring_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'critical')),
        message TEXT NOT NULL,
        details_json TEXT,
        alerted_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_mon_kind ON monitoring_events(kind, created_at)`);
    db.exec(`CREATE INDEX idx_mon_severity ON monitoring_events(severity)`);
    logger.info('Created table: monitoring_events');

    db.exec(`
      CREATE TABLE monitoring_metrics (
        id TEXT PRIMARY KEY,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        captured_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_metric ON monitoring_metrics(metric, captured_at)`);
    logger.info('Created table: monitoring_metrics');
  },
};
