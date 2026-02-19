/**
 * Migration 004: Seed Data
 *
 * Populates initial data:
 * - style_guide: Brand compliance rules from docs/05_DATA_SCHEMA.md Section 4.1
 * - suppliers: Approved vendors from docs/05_DATA_SCHEMA.md Section 4.2
 *
 * Uses INSERT OR IGNORE for idempotency.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '004_seed_data',
  up: (db: Database) => {
    // ========================================
    // Style Guide: Logo Requirements
    // ========================================
    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-001', 'logo', 'position', 'requirement',
        '{"allowed": ["top-right", "bottom-center"]}',
        'critical', 'Logo must be in top-right corner OR bottom-center'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-002', 'logo', 'min_size', 'requirement',
        '{"min_height_px": 80, "reference_resolution": "1080p"}',
        'critical', 'Logo must be minimum 80px height at 1080p'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-003', 'logo', 'clear_space', 'requirement',
        '{"min_padding_px": 20}',
        'warning', 'Logo requires 20px minimum clear space'
      )
    `);

    logger.info('Seeded style_guide: logo rules (3)');

    // ========================================
    // Style Guide: Typography Rules
    // ========================================
    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-010', 'typography', 'headline_font', 'requirement',
        '{"font_family": "Montserrat", "weight": "Bold"}',
        'warning', 'Headlines must use Montserrat Bold'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-011', 'typography', 'body_font', 'requirement',
        '{"font_family": "Open Sans", "weight": "Regular"}',
        'warning', 'Body text must use Open Sans Regular'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-012', 'typography', 'prohibited_fonts', 'prohibition',
        '{"fonts": ["Comic Sans", "Papyrus", "Impact"]}',
        'critical', 'These fonts are prohibited'
      )
    `);

    logger.info('Seeded style_guide: typography rules (3)');

    // ========================================
    // Style Guide: Color Palette
    // ========================================
    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-020', 'color', 'primary', 'requirement',
        '{"hex": "#FF6B6B", "name": "Coral", "tolerance_percent": 5}',
        'warning', 'Primary brand color is Coral'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-021', 'color', 'secondary', 'requirement',
        '{"hex": "#4ECDC4", "name": "Teal", "tolerance_percent": 5}',
        'warning', 'Secondary brand color is Teal'
      )
    `);

    logger.info('Seeded style_guide: color rules (2)');

    // ========================================
    // Style Guide: Technical Standards
    // ========================================
    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-030', 'technical', 'video_resolution', 'requirement',
        '{"min_height": 1080, "min_fps": 30}',
        'critical', 'Video must be minimum 1080p at 30fps'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO style_guide (id, category, rule_name, rule_type, rule_value, severity, description)
      VALUES (
        'sg-031', 'technical', 'audio_levels', 'requirement',
        '{"integrated_lufs": -14, "true_peak_db": -1}',
        'warning', 'Audio must meet broadcast standards'
      )
    `);

    logger.info('Seeded style_guide: technical rules (2)');

    // ========================================
    // Approved Suppliers
    // ========================================
    db.exec(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_email, status, reliability_score, notes)
      VALUES (
        'sup-001', 'Guangzhou Beauty Co', 'orders@gzbeauty.cn', 'active', 85.0,
        'Primary supplier for skincare devices. Quality issue in 2024-03 resolved with credit.'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_email, status, reliability_score, notes)
      VALUES (
        'sup-002', 'Shenzhen Tech Supply', 'b2b@sztech.com', 'active', 92.0,
        'Reliable LED device supplier. Fast shipping.'
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_email, status, reliability_score, notes)
      VALUES (
        'sup-003', 'Hong Kong Logistics', 'accounts@hklog.hk', 'active', 88.0,
        'Freight forwarder. Good rates to Australia.'
      )
    `);

    logger.info('Seeded suppliers: approved vendors (3)');
  },
};
