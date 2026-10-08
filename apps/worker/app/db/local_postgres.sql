-- =====================================================================
-- local_postgres.sql — Aira AI on plain Postgres (no Supabase)
--
-- Creates every table the web + worker expect, a tiny auth.users stub
-- (so the new-user trigger works), 30 Maharashtra stations, one live
-- reading each, and a 7-day forecast for Borivali.
--
-- Column names match the live Supabase project (lat/lng, bucket, ci_low,
-- body_md). Does NOT create storage.buckets. RLS stays off for the local
-- superuser. Production owner policies live in migrations/03_owner_policies.sql.
--
-- Usage (from the repo root):
--   createdb aira
--   psql "postgresql://localhost:5432/aira" -f apps/worker/app/db/local_postgres.sql
--
-- Then point the worker at it:
--   DATABASE_URL=postgresql://localhost:5432/aira
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Auth stub. Supabase owns this schema in production. Locally we only
-- need the columns the handle_new_user() trigger reads.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT UNIQUE,
    raw_user_meta_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- App tables (same shape as 01_schema.sql + the forecasts table that
-- was applied live on Supabase but missing from that file)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
    id                   UUID PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    display_name         TEXT,
    bio                  TEXT,
    avatar_url           TEXT,
    theme                TEXT NOT NULL DEFAULT 'light'
                             CHECK (theme IN ('light', 'dark')),
    default_state        TEXT NOT NULL DEFAULT 'maharashtra',
    default_city         TEXT NOT NULL DEFAULT 'mumbai',
    default_place        TEXT NOT NULL DEFAULT 'borivali',
    health_profile       TEXT NOT NULL DEFAULT 'healthy'
                             CHECK (health_profile IN ('healthy', 'child', 'elderly', 'asthmatic')),
    alert_threshold      INTEGER NOT NULL DEFAULT 200
                             CHECK (alert_threshold BETWEEN 0 AND 500),
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at         TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_bio_len CHECK (bio IS NULL OR length(bio) <= 200),
    CONSTRAINT users_display_name_len CHECK (
        display_name IS NULL OR (length(trim(display_name)) BETWEEN 1 AND 40)
    )
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    profile_type       TEXT NOT NULL
                           CHECK (profile_type IN ('healthy', 'child', 'elderly', 'asthmatic')),
    conditions         TEXT[] NOT NULL DEFAULT '{}',
    is_default         BOOLEAN NOT NULL DEFAULT FALSE,
    personal_threshold INTEGER NOT NULL DEFAULT 200
                           CHECK (personal_threshold BETWEEN 0 AND 500),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_default
    ON public.user_profiles(user_id) WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS public.stations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'Maharashtra',
    city        TEXT NOT NULL,
    place       TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    operator    TEXT NOT NULL DEFAULT 'CPCB',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.readings (
    id           BIGSERIAL PRIMARY KEY,
    station_id   TEXT NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    pm25         NUMERIC(8, 2),
    pm10         NUMERIC(8, 2),
    no2          NUMERIC(8, 2),
    so2          NUMERIC(8, 2),
    co           NUMERIC(8, 3),
    o3           NUMERIC(8, 2),
    aqi          INTEGER,
    bucket       TEXT,
    dominant     TEXT,
    source       TEXT NOT NULL DEFAULT 'seed',
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_station_time
    ON public.readings(station_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.forecasts (
    id             BIGSERIAL PRIMARY KEY,
    station_id     TEXT NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    forecast_date  DATE NOT NULL,
    predicted_aqi  INTEGER NOT NULL,
    ci_low         INTEGER NOT NULL,
    ci_high        INTEGER NOT NULL,
    r_squared      NUMERIC(5, 3) NOT NULL DEFAULT 0.620,
    model_version  TEXT NOT NULL DEFAULT 'v1-linreg-30d',
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, forecast_date)
);

CREATE TABLE IF NOT EXISTS public.advisories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id     TEXT NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    profile_type   TEXT NOT NULL
                       CHECK (profile_type IN ('healthy', 'child', 'elderly', 'asthmatic')),
    body_md        TEXT NOT NULL,
    model_version  TEXT,
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.advisory_views (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    advisory_id  UUID NOT NULL REFERENCES public.advisories(id) ON DELETE CASCADE,
    viewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, advisory_id)
);

CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title           TEXT,
    state           TEXT NOT NULL,
    city            TEXT NOT NULL,
    place           TEXT NOT NULL,
    profile_type    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    tokens_in   INTEGER,
    tokens_out  INTEGER,
    model       TEXT,
    tool_calls  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.email_quota (
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    quota_date   DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0 AND count <= 2),
    last_sent_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, quota_date)
);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON public.users;
CREATE TRIGGER users_touch BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS user_profiles_touch ON public.user_profiles;
CREATE TRIGGER user_profiles_touch BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'healthy', TRUE, 200
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- Seed: 30 stations
-- ---------------------------------------------------------------------
INSERT INTO public.stations (id, name, state, city, place, lat, lng) VALUES
    ('MUMBAI_BORIVALI',  'Borivali',     'Maharashtra', 'Mumbai',     'Borivali',      19.2307, 72.8567),
    ('MUMBAI_BANDRA',    'Bandra',       'Maharashtra', 'Mumbai',     'Bandra',        19.0596, 72.8295),
    ('MUMBAI_ANDHERI',   'Andheri',      'Maharashtra', 'Mumbai',     'Andheri',       19.1136, 72.8697),
    ('MUMBAI_COLABA',    'Colaba',       'Maharashtra', 'Mumbai',     'Colaba',        18.9067, 72.8147),
    ('MUMBAI_NAVI',      'Navi Mumbai',  'Maharashtra', 'Mumbai',     'Navi Mumbai',   19.0330, 73.0297),
    ('MUMBAI_THANE',     'Thane',        'Maharashtra', 'Mumbai',     'Thane',         19.2183, 72.9781),
    ('PUNE_KOTHRUD',     'Kothrud',      'Maharashtra', 'Pune',       'Kothrud',       18.5074, 73.8077),
    ('PUNE_SWARGATE',    'Swargate',     'Maharashtra', 'Pune',       'Swargate',      18.5018, 73.8636),
    ('NAGPUR_CIVIL',     'Civil Lines',  'Maharashtra', 'Nagpur',     'Civil Lines',   21.1458, 79.0882),
    ('NAGPUR_RAM',       'Ramdaspeth',   'Maharashtra', 'Nagpur',     'Ramdaspeth',    21.1389, 79.0686),
    ('NASHIK_GANGAPUR',  'Gangapur',     'Maharashtra', 'Nashik',     'Gangapur',      19.9975, 73.7898),
    ('AURANGABAD_CIDCO', 'CIDCO',        'Maharashtra', 'Aurangabad', 'CIDCO',         19.8762, 75.3433),
    ('SOLAPUR_BHAVI',    'Bhavani Peth', 'Maharashtra', 'Solapur',    'Bhavani Peth',  17.6599, 75.9064),
    ('KOLHAPUR_RANKALA', 'Rankala',      'Maharashtra', 'Kolhapur',   'Rankala',       16.7050, 74.2433),
    ('SANGLI_VISH',      'Vishrambaug',  'Maharashtra', 'Sangli',     'Vishrambaug',   16.8524, 74.5815),
    ('RATNAGIRI_KS',     'K.S. Wadi',    'Maharashtra', 'Ratnagiri',  'K.S. Wadi',     16.9944, 73.3122),
    ('SINDHUDURG',       'Sindhudurg',   'Maharashtra', 'Sindhudurg', 'Sindhudurg',    16.3500, 73.7500),
    ('AKOLA_DAS',        'Dastur Nagar', 'Maharashtra', 'Akola',      'Dastur Nagar',  20.7000, 77.0000),
    ('AMRAVATI',         'Amravati',     'Maharashtra', 'Amravati',   'Amravati',      20.9333, 77.7500),
    ('LATUR',            'Latur',        'Maharashtra', 'Latur',      'Latur',         18.4000, 76.5833),
    ('OSMANABAD',        'Osmanabad',    'Maharashtra', 'Osmanabad',  'Osmanabad',     18.1500, 76.0500),
    ('PARBHANI',         'Parbhani',     'Maharashtra', 'Parbhani',   'Parbhani',      19.2700, 76.7600),
    ('JALGAON',          'Jalgaon',      'Maharashtra', 'Jalgaon',    'Jalgaon',       21.0167, 75.5667),
    ('DHULE',            'Dhule',        'Maharashtra', 'Dhule',      'Dhule',         20.9000, 74.7833),
    ('NANDURBAR',        'Nandurbar',    'Maharashtra', 'Nandurbar',  'Nandurbar',     21.3667, 74.2500),
    ('WASHIM',           'Washim',       'Maharashtra', 'Washim',     'Washim',        20.1110, 77.1333),
    ('HINGOLI',          'Hingoli',      'Maharashtra', 'Hingoli',    'Hingoli',       19.7200, 77.1500),
    ('GADCHIROLI',       'Gadchiroli',   'Maharashtra', 'Gadchiroli', 'Gadchiroli',    20.1800, 80.0000),
    ('CHANDRAPUR',       'Chandrapur',   'Maharashtra', 'Chandrapur', 'Chandrapur',    19.9500, 79.3000),
    ('GADAG',            'Gadag',        'Maharashtra', 'Gadag',      'Gadag',         15.4167, 75.6167)
ON CONFLICT (id) DO NOTHING;

-- One current reading per station (deterministic, not random).
INSERT INTO public.readings (station_id, pm25, pm10, no2, so2, co, o3, aqi, bucket, dominant, source, recorded_at)
SELECT
    s.id,
    40 + (abs(hashtext(s.id)) % 80)::numeric,
    70 + (abs(hashtext(s.id)) % 120)::numeric,
    15 + (abs(hashtext(s.id)) % 40)::numeric,
    4 + (abs(hashtext(s.id)) % 12)::numeric,
    0.4 + ((abs(hashtext(s.id)) % 10)::numeric / 10),
    20 + (abs(hashtext(s.id)) % 40)::numeric,
    80 + (abs(hashtext(s.id)) % 140),
    CASE
        WHEN 80 + (abs(hashtext(s.id)) % 140) < 100 THEN 'Satisfactory'
        WHEN 80 + (abs(hashtext(s.id)) % 140) < 200 THEN 'Moderate'
        ELSE 'Poor'
    END,
    'PM2.5',
    'seed',
    NOW()
FROM public.stations s
WHERE NOT EXISTS (
    SELECT 1 FROM public.readings r WHERE r.station_id = s.id
);

-- 7-day forecast for every station.
INSERT INTO public.forecasts (station_id, forecast_date, predicted_aqi, ci_low, ci_high, r_squared, model_version)
SELECT
    s.id,
    (CURRENT_DATE + g.i),
    100 + (abs(hashtext(s.id)) % 60) + g.i * 3,
    80 + (abs(hashtext(s.id)) % 40) + g.i * 2,
    130 + (abs(hashtext(s.id)) % 70) + g.i * 4,
    0.620,
    'v1-linreg-30d'
FROM public.stations s
CROSS JOIN generate_series(0, 6) AS g(i)
ON CONFLICT (station_id, forecast_date) DO NOTHING;

-- Local demo user. Inserting into auth.users fires handle_new_user().
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'harish@example.com',
    '{"display_name":"Harish"}'::jsonb
)
ON CONFLICT (email) DO NOTHING;
