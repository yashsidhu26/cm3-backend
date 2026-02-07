-- Add sync state tracking and source tracking to assignments/evaluations

-- Create sync_source enum
DO $$ BEGIN
    CREATE TYPE sync_source AS ENUM ('moodle', 'gmail');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create sync_state table
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    source sync_source NOT NULL,

    -- For Moodle: last notification ID processed
    last_notification_id VARCHAR(100),

    -- For Gmail: last email internal date (milliseconds since epoch)
    last_email_timestamp VARCHAR(50),

    -- For Gmail: last history ID for incremental sync
    last_history_id VARCHAR(100),

    last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint: one sync state per user per source
    UNIQUE(user_id, source)
);

-- Add source tracking to student_assignments
ALTER TABLE student_assignments
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);

-- Add source tracking to student_evaluations
ALTER TABLE student_evaluations
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_state_user_source ON sync_state(user_id, source);
CREATE INDEX IF NOT EXISTS idx_assignments_source ON student_assignments(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_source ON student_evaluations(source_type, source_id);

-- Comment
COMMENT ON TABLE sync_state IS 'Tracks last synced position for each data source to prevent reprocessing';
