-- 149_role_type_growth.sql
-- Extend role_type ENUM to support the growth role (SEO + Tender monitoring).
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'growth';
