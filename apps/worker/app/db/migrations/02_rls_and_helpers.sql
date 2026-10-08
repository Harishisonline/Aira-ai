"""
Supabase RLS policies and helper functions.
This migration is separate from the base schema because it depends on
Supabase's auth.uid() function. It runs after 01_schema.sql.

See PRD §7 (Database schema) for the full specification.
"""

-- Helper function: atomic email quota check-and-increment.
-- The check happens BEFORE the increment so we never violate the
-- email_quota_count_check (count <= 2) constraint.
-- Returns (allowed, new_count). If allowed is False, the cap was hit and
-- no row was written.
CREATE OR REPLACE FUNCTION check_and_increment_email_quota(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, new_count INTEGER) AS $$
DECLARE
    v_count INTEGER;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
    -- Get current count for today (or 0 if no row yet)
    SELECT COALESCE(count, 0) INTO v_count
    FROM email_quota
    WHERE user_id = p_user_id AND quota_date = v_today;

    -- Deny BEFORE incrementing to satisfy the cap constraint
    IF v_count >= 2 THEN
        RETURN QUERY SELECT FALSE, v_count;
        RETURN;
    END IF;

    -- Increment (upsert)
    INSERT INTO email_quota (user_id, quota_date, count, last_sent_at)
    VALUES (p_user_id, v_today, 1, NOW())
    ON CONFLICT (user_id, quota_date)
    DO UPDATE SET count = email_quota.count + 1, last_sent_at = NOW()
    RETURNING count INTO v_count;

    RETURN QUERY SELECT TRUE, v_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function: get today's email count for a user
CREATE OR REPLACE FUNCTION get_email_quota_today(p_user_id UUID)
RETURNS TABLE(count INTEGER) AS $$
    SELECT count FROM email_quota
    WHERE user_id = p_user_id
      AND quota_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
$$ LANGUAGE sql STABLE;

-- Helper function: get the user's default area as a single object
CREATE OR REPLACE FUNCTION get_user_default_area(p_user_id UUID)
RETURNS TABLE(state TEXT, city TEXT, place TEXT) AS $$
    SELECT default_state, default_city, default_place FROM users WHERE id = p_user_id;
$$ LANGUAGE sql STABLE;

-- Helper function: list the user's chat sessions, grouped by recency
-- Returns a JSONB array of { bucket, sessions: [...] } objects.
-- Uses a CTE to avoid nested jsonb_agg (Postgres rejects aggregate nesting).
CREATE OR REPLACE FUNCTION list_chat_sessions_grouped(p_user_id UUID)
RETURNS JSONB AS $$
    WITH sessions AS (
        SELECT
            cs.id, cs.title, cs.state, cs.city, cs.place, cs.profile_type,
            cs.created_at, cs.last_message_at,
            CASE
                WHEN cs.last_message_at > NOW() - INTERVAL '1 day' THEN 'Today'
                WHEN cs.last_message_at > NOW() - INTERVAL '2 days' THEN 'Yesterday'
                WHEN cs.last_message_at > NOW() - INTERVAL '7 days' THEN 'This week'
                ELSE 'Older'
            END AS bucket
        FROM chat_sessions cs
        WHERE cs.user_id = p_user_id
        ORDER BY cs.last_message_at DESC NULLS LAST
    ),
    bucketed AS (
        SELECT
            bucket,
            jsonb_agg(
                jsonb_build_object(
                    'id', id, 'title', title, 'state', state, 'city', city, 'place', place,
                    'profile', profile_type, 'created_at', created_at, 'last_message_at', last_message_at
                ) ORDER BY last_message_at DESC NULLS LAST
            ) AS sessions
        FROM sessions
        GROUP BY bucket
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'sessions', sessions) ORDER BY bucket), '[]'::jsonb)
    FROM bucketed;
$$ LANGUAGE sql STABLE;

-- Helper function: count today's chat messages for a user (daily cap)
CREATE OR REPLACE FUNCTION count_today_chat_messages(p_user_id UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM chat_messages cm
    JOIN chat_sessions cs ON cs.id = cm.session_id
    WHERE cs.user_id = p_user_id
      AND cm.role = 'user'
      AND cm.created_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
$$ LANGUAGE sql STABLE;

-- Helper function: destructive user deletion (called from /api/users/me/delete)
-- CASCADE handles chat_sessions, chat_messages, advisory_views, user_profiles,
-- email_log, email_quota. Storage avatar deletion is the caller's job.
CREATE OR REPLACE FUNCTION delete_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Delete dependent rows first (in case CASCADE isn't enough)
    DELETE FROM email_log WHERE user_id = p_user_id;
    DELETE FROM email_quota WHERE user_id = p_user_id;
    DELETE FROM advisory_views WHERE user_id = p_user_id;
    DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = p_user_id);
    DELETE FROM chat_sessions WHERE user_id = p_user_id;
    DELETE FROM user_profiles WHERE user_id = p_user_id;
    DELETE FROM users WHERE id = p_user_id;
    -- auth.users deletion is the Supabase admin's job (we cannot do it from a SECURITY DEFINER function)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: detect a threshold crossing for a user+place
-- Returns TRUE if the new AQI is at/above the user's threshold AND the
-- previous AQI was below (i.e. a fresh crossing, not "still above").
CREATE OR REPLACE FUNCTION is_threshold_crossing(
    p_user_id UUID, p_station_id TEXT, p_new_aqi NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
    v_threshold INTEGER;
    v_previous_aqi NUMERIC;
BEGIN
    SELECT alert_threshold INTO v_threshold FROM users WHERE id = p_user_id;
    IF v_threshold IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_new_aqi < v_threshold THEN
        RETURN FALSE;  -- not a crossing if we're still below
    END IF;
    -- Look up the previous reading
    SELECT aqi INTO v_previous_aqi
    FROM readings
    WHERE station_id = p_station_id
    ORDER BY recorded_at DESC
    LIMIT 1 OFFSET 1;  -- skip the just-inserted current reading
    IF v_previous_aqi IS NULL OR v_previous_aqi < v_threshold THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: check if a new reading is stale (>2 hours since last)
-- Used by /aqi/now to flag stale data to the client.
CREATE OR REPLACE FUNCTION is_reading_stale(p_station_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_last TIMESTAMPTZ;
BEGIN
    SELECT recorded_at INTO v_last FROM readings
    WHERE station_id = p_station_id
    ORDER BY recorded_at DESC LIMIT 1;
    IF v_last IS NULL THEN
        RETURN TRUE;
    END IF;
    RETURN (NOW() - v_last) > INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql STABLE;

-- Indexes that RLS needs
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_advisory_views_user_id ON advisory_views(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_quota_user_id ON email_quota(user_id);
CREATE INDEX IF NOT EXISTS idx_stations_state_city_place ON stations(state, city, place);
CREATE INDEX IF NOT EXISTS idx_readings_station_time ON readings(station_id, recorded_at DESC);

-- ============================================================================
-- Storage: 'avatars' bucket + 4 RLS policies
-- Idempotent (INSERT ... ON CONFLICT DO UPDATE, DROP POLICY IF EXISTS)
-- ============================================================================

-- Create the private avatars bucket (2 MB max, jpeg/png/webp)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    false,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Users can read their own avatar (folder name starts with their user_id)
DROP POLICY IF EXISTS "avatar_select_own" ON storage.objects;
CREATE POLICY "avatar_select_own" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can upload to their own folder
DROP POLICY IF EXISTS "avatar_insert_own" ON storage.objects;
CREATE POLICY "avatar_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update/replace their own avatars
DROP POLICY IF EXISTS "avatar_update_own" ON storage.objects;
CREATE POLICY "avatar_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own avatars
DROP POLICY IF EXISTS "avatar_delete_own" ON storage.objects;
CREATE POLICY "avatar_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
-- Add public-read RLS policies for all the tables that should be browseable
-- by anyone (no auth required) on Aira AI.

-- Stations: list of 30 Maharashtra stations is public civic data
CREATE POLICY stations_read_public ON stations
  FOR SELECT TO public
  USING (true);

-- Readings: AQI readings are public once they exist
CREATE POLICY readings_read_public ON readings
  FOR SELECT TO public
  USING (true);

-- User profiles: NOT public (only the owner can read)
-- (We don't add a policy here; rely on default deny)

-- Chat sessions / messages: NOT public (only the owner)
-- (No policy; default deny)

-- Advisories: cached LLM-generated advisories, public for sharing
CREATE POLICY advisories_read_public ON advisories
  FOR SELECT TO public
  USING (true);

-- Email log / quota: NOT public
-- (No policy; default deny)

-- Forecasts: 7-day predictions are public civic data
DROP POLICY IF EXISTS forecasts_read_public ON forecasts;
CREATE POLICY forecasts_read_public ON forecasts
  FOR SELECT TO public
  USING (true);
