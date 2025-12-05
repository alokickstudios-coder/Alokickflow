-- Create google_tokens table for storing Google OAuth tokens
-- This table stores access and refresh tokens for Google Drive/Sheets API access

CREATE TABLE IF NOT EXISTS google_tokens (
    id TEXT PRIMARY KEY DEFAULT 'default',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_tokens_user_id ON google_tokens(user_id) WHERE user_id IS NOT NULL;

-- Create index on expires_at for finding valid tokens
CREATE INDEX IF NOT EXISTS idx_google_tokens_expires_at ON google_tokens(expires_at);

-- Allow both id and user_id to be unique (for backward compatibility)
-- If user_id exists, it should be unique per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_tokens_user_id_unique ON google_tokens(user_id) WHERE user_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE google_tokens IS 'Stores Google OAuth tokens for Drive and Sheets API access';
COMMENT ON COLUMN google_tokens.id IS 'Primary key, defaults to "default" for global tokens';
COMMENT ON COLUMN google_tokens.user_id IS 'Optional: user ID if token is user-specific';
COMMENT ON COLUMN google_tokens.access_token IS 'Google OAuth access token';
COMMENT ON COLUMN google_tokens.refresh_token IS 'Google OAuth refresh token for getting new access tokens';
COMMENT ON COLUMN google_tokens.expires_at IS 'When the access token expires';



