-- Add 'test' to evaluation_type enum
-- Run this with: psql $DATABASE_URL -f scripts/add-test-to-evaluation-enum.sql

ALTER TYPE evaluation_type ADD VALUE IF NOT EXISTS 'test';
