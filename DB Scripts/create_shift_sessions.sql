-- Create shift_sessions table to support backend logic
CREATE TABLE IF NOT EXISTS shift_sessions (
    shift_session_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    shift_name VARCHAR(20) NOT NULL REFERENCES shifts(shift_name),
    clerk_initials VARCHAR(10) NOT NULL,
    session_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    closed_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shift_name, session_date, clerk_initials)
);

-- Index for faster lookups (used in login check)
CREATE INDEX IF NOT EXISTS idx_shift_sessions_lookup 
ON shift_sessions(shift_name, session_date, status);
