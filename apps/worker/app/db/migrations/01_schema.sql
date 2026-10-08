-- =====================================================================
-- 01_schema.sql — Aira AI database schema
-- Run order: 01_schema.sql THEN 02_rls_and_helpers.sql
-- This file is idempotent (CREATE TABLE IF NOT EXISTS, etc.)
-- =====================================================================

-- pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 0. AUTH
-- Supabase Auth manages auth.users. We mirror the auth user into our
-- public.users table via a trigger on first sign-in.
-- In local dev (docker-compose with bare Postgres), we create auth.users
-- manually in the seed script.
-- =====================================================================

-- Trigger: when a new auth.user is created, create a public.users mirror.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name, default_state, default_city, default_place)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'maharashtra', 'mumbai', 'borivali'
    )
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_profiles (user_id, name, profile_type, is_default, personal_threshold)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 'healthy', TRUE, 200)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 1. CORE USER TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY,            -- mirrors auth.users.id
    email               TEXT NOT NULL UNIQUE,
    display_name        TEXT,
    bio                 TEXT CHECK (bio IS NULL OR length(bio) <= 200),
    avatar_url          TEXT,
    theme               TEXT NOT NULL DEFAULT 'light'
                            CHECK (theme IN ('light', 'dark')),
    default_state       TEXT NOT NULL DEFAULT 'maharashtra',
    default_city        TEXT NOT NULL DEFAULT 'mumbai',
    default_place       TEXT NOT NULL DEFAULT 'borivali',
    health_profile      TEXT NOT NULL DEFAULT 'healthy'
                            CHECK (health_profile IN ('healthy', 'child', 'elderly', 'asthmatic')),
    alert_threshold     INTEGER NOT NULL DEFAULT 200
                            CHECK (alert_threshold BETWEEN 0 AND 500),
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD CONSTRAINT users_display_name_len
    CHECK (display_name IS NULL OR (length(trim(display_name)) BETWEEN 1 AND 40));

CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    profile_type        TEXT NOT NULL
                            CHECK (profile_type IN ('healthy', 'child', 'elderly', 'asthmatic')),
    conditions          TEXT[] NOT NULL DEFAULT '{}',
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    personal_threshold  INTEGER NOT NULL DEFAULT 200
                            CHECK (personal_threshold BETWEEN 0 AND 500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_default
    ON user_profiles(user_id) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

-- Trigger: touch updated_at on row update
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS user_profiles_touch ON user_profiles;
CREATE TRIGGER user_profiles_touch BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =====================================================================
-- 2. STATIONS + READINGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS stations (
    id              TEXT PRIMARY KEY,           -- CPCB/OpenAQ station id
    name            TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'Maharashtra',
    city            TEXT NOT NULL,
    place           TEXT NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    operator        TEXT NOT NULL DEFAULT 'CPCB',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stations_state_city_place ON stations(state, city, place);

CREATE TABLE IF NOT EXISTS readings (
    id              BIGSERIAL PRIMARY KEY,
    station_id      TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    pm25            NUMERIC(8, 2),
    pm10            NUMERIC(8, 2),
    no2             NUMERIC(8, 2),
    so2             NUMERIC(8, 2),
    co              NUMERIC(8, 3),            -- mg/m³
    o3              NUMERIC(8, 2),
    aqi             INTEGER,                    -- computed NAQI
    bucket          TEXT,
    dominant        TEXT,
    source          TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'openaq' | 'mock' | 'seed'
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_station_time ON readings(station_id, recorded_at DESC);

-- =====================================================================
-- 3. ADVISORIES
-- =====================================================================

CREATE TABLE IF NOT EXISTS advisories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    profile_type    TEXT NOT NULL CHECK (profile_type IN ('healthy', 'child', 'elderly', 'asthmatic')),
    body_md         TEXT NOT NULL,
    model_version   TEXT,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advisories_station_profile ON advisories(station_id, profile_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS advisory_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    advisory_id     UUID NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
    viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, advisory_id)
);

CREATE INDEX IF NOT EXISTS idx_advisory_views_user ON advisory_views(user_id, viewed_at DESC);

-- =====================================================================
-- 4. CHAT (sessions + messages)
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT,
    state           TEXT NOT NULL,
    city            TEXT NOT NULL,
    place           TEXT NOT NULL,
    profile_type    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_time
    ON chat_sessions(user_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    tokens_in       INTEGER,
    tokens_out      INTEGER,
    model           TEXT,
    tool_calls      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time
    ON chat_messages(session_id, created_at);

-- =====================================================================
-- 5. EMAIL TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS email_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL
                        CHECK (kind IN ('threshold_alert', 'scheduled', 'daily_cap_notice', 'verification')),
    recipient       TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body_md         TEXT,
    related_state   TEXT,
    related_city    TEXT,
    related_place   TEXT,
    related_when    TIMESTAMPTZ,
    scheduled_for   TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
    resend_id       TEXT,
    failure_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user_time ON email_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_pending ON email_log(scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_email_log_related_area ON email_log(related_state, related_city, related_place);

CREATE TABLE IF NOT EXISTS email_quota (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quota_date      DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    count           INTEGER NOT NULL DEFAULT 0
                        CHECK (count >= 0 AND count <= 2),
    last_sent_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, quota_date)
);

CREATE INDEX IF NOT EXISTS idx_email_quota_date ON email_quota(quota_date);

-- =====================================================================
-- 6. SUPABASE STORAGE: avatars bucket
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars', 'avatars', false, 2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
