/**
 * seed-demo.ts — Populate the database with a realistic demo data set
 * for live walkthroughs.
 *
 * Seeds:
 *   - 3 users (admin partner, senior associate lawyer, junior paralegal)
 *   - 12 matters across litigation, contract review, family law,
 *     conveyancing and corporate
 *   - 30 documents (document_versions + classifications)
 *   - 15 deadlines staggered over 60 days, several overdue
 *   - 8 items waiting in the review queue
 *   - billing log entries (AI runs + lawyer time) per matter
 *   - hash-chained legal audit entries
 *   - a handful of verified/unverified citations for coverage display
 *
 * All names are plausibly Australian but obviously fake.
 *
 * Usage:
 *   npm run demo:seed     # wipe to a clean DB, then seed (idempotent)
 *   npm run demo:reset    # wipe to a clean, empty migrated DB
 *
 * Target database:
 *   Respects DATABASE_PATH (defaults to ./data/bitbit.db — the same DB
 *   the dashboard reads), so after seeding you can simply run
 *   `npm run dashboard` and log in to see the demo firm.
 *
 * Safety:
 *   Both modes delete and recreate the target SQLite file. They refuse
 *   to run when NODE_ENV=production unless --force is passed, so a real
 *   firm cannot wipe live data by accident.
 */

import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

// Resolve the target DB path the same way the app does, and make sure
// the connection module picks it up before anything opens a handle.
const DB_PATH =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === 'production' ? '/data/bitbit.db' : './data/bitbit.db');
process.env.DATABASE_PATH = DB_PATH;

const args = new Set(process.argv.slice(2));
const RESET_ONLY = args.has('--reset');
const FORCE = args.has('--force');

import { initializeDatabase, closeDatabase, getDatabase } from '../src/db/index.js';
import { createUser } from '../src/users/index.js';
import { appendLegalAudit } from '../src/compliance/audit.js';

const DEMO_PASSWORD = 'DemoPass123!';

// ---------------------------------------------------------------------------
// Date helpers — everything is anchored to "now" so the demo always looks live
// ---------------------------------------------------------------------------
const NOW = new Date();
function daysFromNow(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}
function iso(d: Date): string {
  return d.toISOString();
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Wipe + recreate
// ---------------------------------------------------------------------------
function wipeDatabase(): void {
  if (process.env.NODE_ENV === 'production' && !FORCE) {
    console.error(
      'Refusing to wipe the database while NODE_ENV=production. ' +
        'Pass --force if you really mean it.',
    );
    process.exit(1);
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DB_PATH}${suffix}`;
    if (existsSync(file)) {
      rmSync(file);
    }
  }
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  console.log(`Wiped database at ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// Demo data definitions
// ---------------------------------------------------------------------------
interface DemoUser {
  key: 'partner' | 'senior' | 'junior';
  email: string;
  full_name: string;
  role: 'admin' | 'lawyer' | 'paralegal';
}

const USERS: DemoUser[] = [
  {
    key: 'partner',
    email: 'm.whitlam@harbourlawpartners.com.au',
    full_name: 'Margaret Whitlam',
    role: 'admin',
  },
  {
    key: 'senior',
    email: 'd.nguyen@harbourlawpartners.com.au',
    full_name: 'David Nguyen',
    role: 'lawyer',
  },
  {
    key: 'junior',
    email: 'p.sharma@harbourlawpartners.com.au',
    full_name: 'Priya Sharma',
    role: 'paralegal',
  },
];

type MatterType =
  | 'litigation'
  | 'contract_review'
  | 'family_law'
  | 'conveyancing'
  | 'corporate';

interface DemoMatter {
  number: string;
  title: string;
  client_name: string;
  client_email: string;
  matter_type: MatterType;
  jurisdiction: string;
  lawyer: 'partner' | 'senior' | 'junior';
  opposing_party?: string;
  opposing_solicitor?: string;
  status: 'open' | 'on_hold' | 'closed';
  openedDaysAgo: number;
  notes: string;
}

const MATTERS: DemoMatter[] = [
  {
    number: '2026-0001',
    title: 'Brunswick Foods Pty Ltd v Coastline Logistics — supply contract dispute',
    client_name: 'Brunswick Foods Pty Ltd',
    client_email: 'accounts@brunswickfoods.example.com.au',
    matter_type: 'litigation',
    jurisdiction: 'NSW',
    lawyer: 'partner',
    opposing_party: 'Coastline Logistics Pty Ltd',
    opposing_solicitor: 'Reedy & Associates',
    status: 'open',
    openedDaysAgo: 48,
    notes: 'Breach of supply agreement; quantum approx $480k. Mediation listed.',
  },
  {
    number: '2026-0002',
    title: 'Tran v Tran — property settlement',
    client_name: 'Lillian Tran',
    client_email: 'lillian.tran@example.com.au',
    matter_type: 'family_law',
    jurisdiction: 'VIC',
    lawyer: 'senior',
    opposing_party: 'Michael Tran',
    opposing_solicitor: 'Goldstein Family Law',
    status: 'open',
    openedDaysAgo: 35,
    notes: 'Property pool ~$1.6m incl. SMSF. Two children, parenting agreed.',
  },
  {
    number: '2026-0003',
    title: 'Acquisition of Jacaranda Cafe Group — share sale',
    client_name: 'Eucalypt Ventures Pty Ltd',
    client_email: 'deals@eucalyptventures.example.com.au',
    matter_type: 'corporate',
    jurisdiction: 'NSW',
    lawyer: 'partner',
    status: 'open',
    openedDaysAgo: 21,
    notes: 'Share sale, 100% of Jacaranda Cafe Group. Due diligence underway.',
  },
  {
    number: '2026-0004',
    title: '14 Marlborough Street, Surry Hills — purchase',
    client_name: 'Daniel & Aroha Whitford',
    client_email: 'daniel.whitford@example.com.au',
    matter_type: 'conveyancing',
    jurisdiction: 'NSW',
    lawyer: 'junior',
    status: 'open',
    openedDaysAgo: 12,
    notes: 'Residential purchase $1.42m. Cooling-off waived (66W certificate).',
  },
  {
    number: '2026-0005',
    title: 'Master services agreement review — CloudReef Pty Ltd',
    client_name: 'CloudReef Pty Ltd',
    client_email: 'legal@cloudreef.example.com.au',
    matter_type: 'contract_review',
    jurisdiction: 'QLD',
    lawyer: 'senior',
    status: 'open',
    openedDaysAgo: 9,
    notes: 'Reviewing inbound MSA from enterprise customer; liability caps flagged.',
  },
  {
    number: '2026-0006',
    title: 'Pemberton v State of New South Wales — personal injury',
    client_name: 'Gregory Pemberton',
    client_email: 'greg.pemberton@example.com.au',
    matter_type: 'litigation',
    jurisdiction: 'NSW',
    lawyer: 'partner',
    opposing_party: 'State of New South Wales',
    opposing_solicitor: 'Crown Solicitor’s Office',
    status: 'open',
    openedDaysAgo: 58,
    notes: 'Public liability claim. Limitation period a live issue — see deadlines.',
  },
  {
    number: '2026-0007',
    title: 'Outback Mining Supplies — employment dispute',
    client_name: 'Outback Mining Supplies Pty Ltd',
    client_email: 'hr@outbackmining.example.com.au',
    matter_type: 'litigation',
    jurisdiction: 'WA',
    lawyer: 'senior',
    opposing_party: 'Former employee (K. O’Sullivan)',
    status: 'on_hold',
    openedDaysAgo: 41,
    notes: 'General protections claim. On hold pending client instructions.',
  },
  {
    number: '2026-0008',
    title: 'Shareholders agreement — Banksia Health Group',
    client_name: 'Banksia Health Group Pty Ltd',
    client_email: 'directors@banksiahealth.example.com.au',
    matter_type: 'corporate',
    jurisdiction: 'VIC',
    lawyer: 'partner',
    status: 'open',
    openedDaysAgo: 27,
    notes: 'New shareholders agreement for three founding GPs plus investor.',
  },
  {
    number: '2026-0009',
    title: 'Fitzroy v Fitzroy — consent orders',
    client_name: 'Sarah Fitzroy',
    client_email: 'sarah.fitzroy@example.com.au',
    matter_type: 'family_law',
    jurisdiction: 'QLD',
    lawyer: 'junior',
    opposing_party: 'James Fitzroy',
    status: 'open',
    openedDaysAgo: 6,
    notes: 'Drafting consent orders; parties largely agreed.',
  },
  {
    number: '2026-0010',
    title: '7/233 Glenferrie Road, Malvern — sale',
    client_name: 'Estate of the late Beatrice Holloway',
    client_email: 'executor.holloway@example.com.au',
    matter_type: 'conveyancing',
    jurisdiction: 'VIC',
    lawyer: 'junior',
    status: 'open',
    openedDaysAgo: 18,
    notes: 'Sale of deceased estate apartment; probate granted.',
  },
  {
    number: '2026-0011',
    title: 'Distribution agreement — Saltbush Organics',
    client_name: 'Saltbush Organics Pty Ltd',
    client_email: 'founders@saltbushorganics.example.com.au',
    matter_type: 'contract_review',
    jurisdiction: 'SA',
    lawyer: 'senior',
    status: 'open',
    openedDaysAgo: 14,
    notes: 'Exclusive distribution agreement for a national grocery chain.',
  },
  {
    number: '2025-0207',
    title: 'Kowalski v Brightwater Strata — building defects',
    client_name: 'Anton Kowalski',
    client_email: 'anton.kowalski@example.com.au',
    matter_type: 'litigation',
    jurisdiction: 'NSW',
    lawyer: 'partner',
    opposing_party: 'Brightwater Strata Plan 78421',
    opposing_solicitor: 'Meridian Legal',
    status: 'closed',
    openedDaysAgo: 320,
    notes: 'Building defects claim — settled at mediation. Matter closed.',
  },
];

// Document filename templates per matter type
const DOC_TEMPLATES: Record<MatterType, { name: string; type: string; urgency: string }[]> = {
  litigation: [
    { name: 'Statement of Claim.pdf', type: 'court_document', urgency: 'priority' },
    { name: 'Affidavit of {client}.docx', type: 'affidavit', urgency: 'priority' },
    { name: 'Brief to Counsel.pdf', type: 'brief', urgency: 'routine' },
    { name: 'Without Prejudice Offer.pdf', type: 'correspondence', urgency: 'urgent' },
  ],
  contract_review: [
    { name: 'Draft Agreement v3.docx', type: 'contract', urgency: 'priority' },
    { name: 'Risk Review Memo.pdf', type: 'memo', urgency: 'routine' },
    { name: 'Markup — Schedule 2.docx', type: 'contract', urgency: 'routine' },
  ],
  family_law: [
    { name: 'Financial Statement.pdf', type: 'court_form', urgency: 'priority' },
    { name: 'Draft Consent Orders.docx', type: 'court_document', urgency: 'priority' },
    { name: 'Asset Schedule.xlsx', type: 'schedule', urgency: 'routine' },
  ],
  conveyancing: [
    { name: 'Contract for Sale.pdf', type: 'contract', urgency: 'priority' },
    { name: 'Section 149 Planning Certificate.pdf', type: 'certificate', urgency: 'routine' },
    { name: 'Transfer (Land Registry).pdf', type: 'court_form', urgency: 'priority' },
  ],
  corporate: [
    { name: 'Share Sale Agreement.docx', type: 'contract', urgency: 'priority' },
    { name: 'Due Diligence Report.pdf', type: 'report', urgency: 'priority' },
    { name: 'Board Resolution.docx', type: 'resolution', urgency: 'routine' },
  ],
};

const PRACTICE_AREA: Record<MatterType, string> = {
  litigation: 'Dispute Resolution',
  contract_review: 'Commercial',
  family_law: 'Family',
  conveyancing: 'Property',
  corporate: 'Corporate',
};

const SKILL_FOR_TYPE: Record<MatterType, string> = {
  litigation: 'legal-research',
  contract_review: 'contract-review',
  family_law: 'matter-drafting',
  conveyancing: 'matter-drafting',
  corporate: 'contract-review',
};

const DISCLAIMER =
  '> **AI-DRAFTED — FOR LAWYER REVIEW.** This document was prepared by Legal ' +
  'Overseer and must be reviewed and approved by an admitted legal practitioner ' +
  'before it is sent or filed.';

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
function seed(): void {
  const db = getDatabase();

  // --- users -------------------------------------------------------------
  const userIdByKey: Record<string, string> = {};
  const emailByKey: Record<string, string> = {};
  for (const u of USERS) {
    const created = createUser({
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      password: DEMO_PASSWORD,
    });
    userIdByKey[u.key] = created.id;
    emailByKey[u.key] = created.email;
  }
  // Mark the firm setup wizard complete so the dashboard goes straight in.
  db.prepare(
    `UPDATE setup_state SET completed = 1, completed_at = ?, completed_by = ?, firm_name = ? WHERE id = 1`,
  ).run(iso(NOW), emailByKey.partner, 'Harbour Law Partners');
  console.log(`Seeded ${USERS.length} users (password for all: ${DEMO_PASSWORD})`);

  // --- matters -----------------------------------------------------------
  const insertMatter = db.prepare(`
    INSERT INTO matters (
      id, matter_number, title, client_name, client_email, matter_type,
      jurisdiction, responsible_lawyer_email, opposing_party,
      opposing_solicitor, status, opened_at, closed_at, notes,
      matter_folder, created_at, updated_at
    ) VALUES (@id, @matter_number, @title, @client_name, @client_email,
      @matter_type, @jurisdiction, @responsible_lawyer_email, @opposing_party,
      @opposing_solicitor, @status, @opened_at, @closed_at, @notes,
      @matter_folder, @opened_at, @opened_at)
  `);

  const matterIdByNumber: Record<string, string> = {};
  for (const m of MATTERS) {
    const id = randomUUID();
    const opened = iso(daysFromNow(-m.openedDaysAgo));
    insertMatter.run({
      id,
      matter_number: m.number,
      title: m.title,
      client_name: m.client_name,
      client_email: m.client_email,
      matter_type: m.matter_type,
      jurisdiction: m.jurisdiction,
      responsible_lawyer_email: emailByKey[m.lawyer],
      opposing_party: m.opposing_party ?? null,
      opposing_solicitor: m.opposing_solicitor ?? null,
      status: m.status,
      opened_at: opened,
      closed_at: m.status === 'closed' ? iso(daysFromNow(-5)) : null,
      notes: m.notes,
      matter_folder: `matters/${m.number}`,
    });
    matterIdByNumber[m.number] = id;

    appendLegalAudit({
      matterId: id,
      actorId: emailByKey[m.lawyer],
      action: 'matter.create',
      detail: `Opened matter ${m.number}: ${m.title}`,
      refTable: 'matters',
      refId: id,
    });
  }
  console.log(`Seeded ${MATTERS.length} matters`);

  // --- documents (document_versions + classifications) -------------------
  const insertDocVersion = db.prepare(`
    INSERT INTO document_versions (
      id, document_id, matter_id, version_number, stored_path, size_bytes,
      content_hash, change_summary, modified_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDocClass = db.prepare(`
    INSERT INTO document_classifications (
      document_id, matter_id, document_type, practice_area, urgency,
      has_deadlines, confidence, classified_by, classified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let docCount = 0;
  const TARGET_DOCS = 30;
  outer: for (let round = 0; round < 4; round++) {
    for (const m of MATTERS) {
      if (m.status === 'closed' && round > 0) continue;
      const templates = DOC_TEMPLATES[m.matter_type];
      const tpl = templates[round % templates.length];
      if (round >= templates.length) continue;

      const documentId = randomUUID();
      const matterId = matterIdByNumber[m.number];
      const filename = tpl.name.replace('{client}', m.client_name.split(' ')[0]);
      const createdAt = iso(daysFromNow(-(m.openedDaysAgo - round * 2)));
      const sizeBytes = 40_000 + Math.floor(Math.random() * 900_000);
      const contentHash = createHash('sha256')
        .update(`${m.number}:${filename}:${round}`)
        .digest('hex');

      insertDocVersion.run(
        randomUUID(),
        documentId,
        matterId,
        1,
        `matters/${m.number}/${filename}`,
        sizeBytes,
        contentHash,
        'Initial version',
        emailByKey[m.lawyer],
        createdAt,
      );
      insertDocClass.run(
        documentId,
        matterId,
        tpl.type,
        PRACTICE_AREA[m.matter_type],
        tpl.urgency,
        tpl.type === 'court_document' || tpl.type === 'court_form' ? 1 : 0,
        0.82 + Math.random() * 0.15,
        'skill:document-classifier',
        createdAt,
      );

      docCount++;
      if (docCount >= TARGET_DOCS) break outer;
    }
  }
  console.log(`Seeded ${docCount} documents`);

  // --- deadlines (15, staggered over 60 days, several overdue) -----------
  const insertDeadline = db.prepare(`
    INSERT INTO deadlines (
      id, matter_id, deadline_type, description, due_date,
      jurisdiction_basis, consequence_if_missed, recommended_action,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  type DL = {
    matter: string;
    type: 'limitation' | 'court' | 'procedural' | 'internal_sla' | 'client';
    description: string;
    dueInDays: number;
    status: 'open' | 'reminded' | 'met' | 'missed';
    basis?: string;
    consequence?: string;
  };
  const DEADLINES: DL[] = [
    { matter: '2026-0006', type: 'limitation', description: 'Limitation period for personal injury claim', dueInDays: -3, status: 'open', basis: 'Limitation Act 1969 (NSW) s 18A', consequence: 'Claim becomes statute-barred' },
    { matter: '2026-0001', type: 'court', description: 'File and serve evidence-in-chief', dueInDays: -1, status: 'open', basis: 'UCPR 2005 (NSW)', consequence: 'Leave required to rely on late evidence' },
    { matter: '2026-0007', type: 'procedural', description: 'Lodge Form F8 response', dueInDays: -7, status: 'missed', basis: 'Fair Work Commission Rules', consequence: 'Matter may proceed undefended' },
    { matter: '2026-0004', type: 'client', description: 'Confirm finance approval with purchaser', dueInDays: -2, status: 'reminded', consequence: 'Settlement timetable at risk' },
    { matter: '2026-0002', type: 'court', description: 'Attend court-ordered mediation', dueInDays: 2, status: 'open', basis: 'FCFCOA direction' },
    { matter: '2026-0001', type: 'court', description: 'Mediation before listed mediator', dueInDays: 5, status: 'open' },
    { matter: '2026-0004', type: 'procedural', description: 'Settlement of 14 Marlborough Street', dueInDays: 7, status: 'open', consequence: 'Penalty interest accrues on late settlement' },
    { matter: '2026-0003', type: 'internal_sla', description: 'Deliver due diligence report to client', dueInDays: 9, status: 'open' },
    { matter: '2026-0005', type: 'internal_sla', description: 'Return marked-up MSA to client', dueInDays: 11, status: 'open' },
    { matter: '2026-0010', type: 'procedural', description: 'Settlement of Malvern apartment sale', dueInDays: 16, status: 'open' },
    { matter: '2026-0009', type: 'court', description: 'File consent orders application', dueInDays: 21, status: 'open', basis: 'FCFCOA (Family Law) Rules 2021' },
    { matter: '2026-0008', type: 'client', description: 'Circulate execution copies of shareholders agreement', dueInDays: 28, status: 'open' },
    { matter: '2026-0011', type: 'internal_sla', description: 'Advice on exclusivity clause to client', dueInDays: 34, status: 'open' },
    { matter: '2026-0006', type: 'court', description: 'Status conference', dueInDays: 45, status: 'open', basis: 'District Court of NSW' },
    { matter: '2026-0002', type: 'court', description: 'Final hearing if not resolved at mediation', dueInDays: 58, status: 'open' },
  ];

  for (const d of DEADLINES) {
    const due = daysFromNow(d.dueInDays);
    insertDeadline.run(
      randomUUID(),
      matterIdByNumber[d.matter],
      d.type,
      d.description,
      isoDate(due),
      d.basis ?? null,
      d.consequence ?? null,
      d.status === 'open' || d.status === 'reminded'
        ? 'Diarise and prepare; notify responsible lawyer'
        : null,
      d.status,
      iso(daysFromNow(d.dueInDays - 20)),
      iso(NOW),
    );
  }
  console.log(`Seeded ${DEADLINES.length} deadlines`);

  // --- review queue (8 pending items) ------------------------------------
  const insertReview = db.prepare(`
    INSERT INTO review_queue (
      id, matter_id, matter_number, skill_id, output_kind, title,
      body_markdown, metadata_json, status, cost_usd, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  type RQ = {
    matter: string;
    kind:
      | 'contract_review'
      | 'research_memo'
      | 'drafted_document'
      | 'client_email'
      | 'matter_management'
      | 'regulatory_alert';
    skill: string;
    title: string;
    body: string;
    cost: number;
    ageDays: number;
  };
  const REVIEWS: RQ[] = [
    {
      matter: '2026-0005',
      kind: 'contract_review',
      skill: 'contract-review',
      title: 'Risk review — CloudReef Master Services Agreement',
      body: `${DISCLAIMER}\n\n## Key risks identified\n\n1. **Unlimited liability** — clause 12.3 carves data breaches out of the liability cap. Recommend a super-cap rather than uncapped exposure.\n2. **Auto-renewal** — clause 4.2 renews for successive 24-month terms unless 90 days' notice given.\n3. **IP assignment** — clause 9 assigns all "deliverables" to the customer; definition is broad enough to capture pre-existing tooling.\n\n## Recommended next step\nReturn a marked-up draft to the client with the three clauses above flagged.`,
      cost: 0.42,
      ageDays: 1,
    },
    {
      matter: '2026-0006',
      kind: 'research_memo',
      skill: 'legal-research',
      title: 'Research memo — limitation period extension (PI)',
      body: `${DISCLAIMER}\n\n## Question\nWhether an extension of the limitation period is available where the cause of action accrued more than three years ago.\n\n## Short answer\nAn extension may be available under the *Limitation Act 1969* (NSW) where the plaintiff was unaware of the connection between the injury and the defendant's act. The discretion is enlivened by s 60C.\n\n## Authorities\n- *Limitation Act 1969* (NSW) ss 18A, 50C, 60C [VERIFIED]\n- Relevant Court of Appeal authority on "material fact of a decisive character" [UNVERIFIED — confirm citation]`,
      cost: 0.61,
      ageDays: 2,
    },
    {
      matter: '2026-0009',
      kind: 'drafted_document',
      skill: 'matter-drafting',
      title: 'Draft consent orders — Fitzroy',
      body: `${DISCLAIMER}\n\n**IN THE FEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA**\n\nApplication for consent orders between the parties. Draft orders cover property division (60/40), retention of the family home by the applicant, and an equal-shared parental responsibility arrangement.\n\n_Drafted for the responsible lawyer to settle before filing._`,
      cost: 0.38,
      ageDays: 1,
    },
    {
      matter: '2026-0004',
      kind: 'client_email',
      skill: 'client-comms',
      title: 'Client email — finance approval reminder (Whitford)',
      body: `${DISCLAIMER}\n\nDear Daniel and Aroha,\n\nA quick reminder that we will need written confirmation of your finance approval before settlement, currently timetabled for next week. Please forward your lender's approval letter at your earliest convenience.\n\nKind regards,\nPriya Sharma\nHarbour Law Partners`,
      cost: 0.07,
      ageDays: 1,
    },
    {
      matter: '2026-0001',
      kind: 'matter_management',
      skill: 'matter-management',
      title: 'Deadline summary — Brunswick Foods litigation',
      body: `${DISCLAIMER}\n\n## Upcoming critical dates\n- **Tomorrow** — evidence-in-chief overdue (leave may be required)\n- **+5 days** — mediation before the listed mediator\n\nRecommend prioritising the outstanding affidavit today.`,
      cost: 0.05,
      ageDays: 0,
    },
    {
      matter: '2026-0003',
      kind: 'drafted_document',
      skill: 'matter-drafting',
      title: 'Draft due diligence report — Jacaranda Cafe Group',
      body: `${DISCLAIMER}\n\n## Executive summary\nNo deal-breaking issues identified. Two matters warrant a price adjustment or warranty:\n1. Two café leases fall outside their option periods within 12 months.\n2. Employee entitlements appear under-accrued by approximately $46,000.\n\nFull findings in the body for partner review.`,
      cost: 0.55,
      ageDays: 3,
    },
    {
      matter: '2026-0008',
      kind: 'contract_review',
      skill: 'contract-review',
      title: 'Review — Banksia Health shareholders agreement (drag/tag)',
      body: `${DISCLAIMER}\n\nDrag-along and tag-along provisions reviewed. The drag threshold (50.1%) may allow the investor to force a sale earlier than the founders expect. Recommend raising the threshold to 75% and adding a minimum price floor.`,
      cost: 0.34,
      ageDays: 2,
    },
    {
      matter: '2026-0011',
      kind: 'regulatory_alert',
      skill: 'compliance-monitor',
      title: 'Regulatory alert — unfair contract terms (distribution)',
      body: `${DISCLAIMER}\n\nThe strengthened unfair contract terms regime under the *Australian Consumer Law* now carries civil penalties. The exclusivity and unilateral variation clauses in the draft distribution agreement may attract scrutiny. Recommend reviewing clauses 6 and 14 before execution.`,
      cost: 0.12,
      ageDays: 4,
    },
  ];

  for (const r of REVIEWS) {
    const id = randomUUID();
    const createdAt = iso(daysFromNow(-r.ageDays));
    insertReview.run(
      id,
      matterIdByNumber[r.matter],
      r.matter,
      r.skill,
      r.kind,
      r.title,
      r.body,
      JSON.stringify({ demo: true, model: 'claude-sonnet-4-6' }),
      r.cost,
      createdAt,
    );
    appendLegalAudit({
      matterId: matterIdByNumber[r.matter],
      actorId: `skill:${r.skill}`,
      action: 'review.create',
      detail: `Queued ${r.kind} for review: ${r.title}`,
      refTable: 'review_queue',
      refId: id,
      modelUsed: 'claude-sonnet-4-6',
    });

    // A couple of verified/unverified citations on the research memo.
    if (r.kind === 'research_memo') {
      const insertCitation = db.prepare(`
        INSERT INTO citations (id, matter_id, review_id, citation_text, url, verified, verification_note, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertCitation.run(
        randomUUID(), matterIdByNumber[r.matter], id,
        'Limitation Act 1969 (NSW) s 60C', 'https://www.austlii.edu.au/cgi-bin/viewdb/au/legis/nsw/consol_act/la1969133/',
        1, 'Matched on austlii.edu.au', createdAt, createdAt,
      );
      insertCitation.run(
        randomUUID(), matterIdByNumber[r.matter], id,
        'Unconfirmed Court of Appeal authority', null,
        0, 'No authoritative AU source matched', null, createdAt,
      );
    }
  }
  console.log(`Seeded ${REVIEWS.length} review-queue items`);

  // --- billing log (AI runs + lawyer time) -------------------------------
  const insertBilling = db.prepare(`
    INSERT INTO billing_log (
      id, matter_id, kind, actor_id, description, duration_seconds,
      cost_usd, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let billingCount = 0;
  for (const m of MATTERS) {
    if (m.status === 'closed') continue;
    const matterId = matterIdByNumber[m.number];
    const lawyerEmail = emailByKey[m.lawyer];

    // 1-2 AI runs
    const aiRuns = 1 + (billingCount % 2);
    for (let i = 0; i < aiRuns; i++) {
      const seconds = 20 + Math.floor(Math.random() * 90);
      insertBilling.run(
        randomUUID(), matterId, 'ai_run', `skill:${SKILL_FOR_TYPE[m.matter_type]}`,
        'Automated drafting / analysis run', seconds,
        Number((0.05 + Math.random() * 0.6).toFixed(2)),
        iso(daysFromNow(-(i + 1))),
      );
      billingCount++;
    }
    // lawyer review time
    const reviewMinutes = 6 + Math.floor(Math.random() * 30);
    insertBilling.run(
      randomUUID(), matterId, 'lawyer_time', lawyerEmail,
      'Reviewing and settling AI-drafted work product', reviewMinutes * 60,
      null, iso(daysFromNow(-1)),
    );
    billingCount++;
  }
  console.log(`Seeded ${billingCount} billing-log entries`);

  // --- a closing audit marker --------------------------------------------
  appendLegalAudit({
    matterId: null,
    actorId: 'system',
    action: 'demo.seed',
    detail: 'Demo data set loaded for walkthrough',
  });

  // --- summary -----------------------------------------------------------
  const counts = {
    users: (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n,
    matters: (db.prepare('SELECT COUNT(*) n FROM matters').get() as { n: number }).n,
    documents: (db.prepare('SELECT COUNT(*) n FROM document_versions').get() as { n: number }).n,
    deadlines: (db.prepare('SELECT COUNT(*) n FROM deadlines').get() as { n: number }).n,
    review_queue: (db.prepare('SELECT COUNT(*) n FROM review_queue').get() as { n: number }).n,
    billing_log: (db.prepare('SELECT COUNT(*) n FROM billing_log').get() as { n: number }).n,
    legal_audit_log: (db.prepare('SELECT COUNT(*) n FROM legal_audit_log').get() as { n: number }).n,
  };
  console.log('\nDemo data summary:');
  console.table(counts);
  console.log('\nLog in to the dashboard with any of:');
  for (const u of USERS) console.log(`  ${u.email}  (${u.role})  — password: ${DEMO_PASSWORD}`);
  console.log('\n  npm run dashboard   then open http://localhost:3000\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main(): void {
  wipeDatabase();
  initializeDatabase();

  if (RESET_ONLY) {
    console.log('Database reset to a clean, empty state.');
    closeDatabase();
    return;
  }

  seed();
  closeDatabase();
}

try {
  main();
} catch (err) {
  console.error('Demo seed failed:', err);
  closeDatabase();
  process.exit(1);
}
