/** Shared types for the Aira AI web app. */

export type Bucket = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
export type Profile = 'healthy' | 'child' | 'elderly' | 'asthmatic';
export type Dominant = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';
export type Theme = 'light' | 'dark';

export interface AqiReading {
  place: string;
  city: string;
  aqi: number;
  bucket: Bucket;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  dominant: string;
  recorded_at: string;
  stale: boolean;
}

export interface StationSummary {
  id: string;
  name: string;
  state: string;
  city: string;
  place: string;
  lat: number;
  lng: number;
  aqi: number | null;
  bucket: Bucket | null;
  dominant: string | null;
}

export interface ForecastPoint {
  date: string;
  predicted_aqi: number;
  confidence_low: number;
  confidence_high: number;
}

export interface ForecastResult {
  place: string;
  r_squared: number;
  model_version: string;
  points: ForecastPoint[];
}

// ----- Supabase row types (mirror of the 02_rls_and_helpers.sql schema) -----

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme: Theme;
  default_state: string | null;
  default_city: string | null;
  default_place: string | null;
  alert_threshold: number;
  email_alerts_enabled: boolean;
  health_profile: Profile;
  created_at: string;
  last_seen_at: string | null;
};

export type StationRow = {
  id: string;
  name: string;
  state: string;
  city: string;
  place: string;
  lat: number | null;
  lng: number | null;
  operator: string | null;
  is_active: boolean;
};

export type ReadingRow = {
  id: number;
  station_id: string;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  aqi: number;
  bucket: Bucket;
  dominant: Dominant;
  source: string;
  recorded_at: string;
};

export type ForecastRow = {
  id: number;
  station_id: string;
  forecast_date: string;
  predicted_aqi: number;
  ci_low: number;
  ci_high: number;
  r_squared: number;
  model_version: string;
  generated_at: string;
};

export type HealthProfileRow = {
  id: string;
  user_id: string;
  name: string;
  profile_type: Profile;
  conditions: string[];
  personal_threshold: number;
  is_default: boolean;
};

export type ChatSessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  state: string;
  city: string;
  place: string;
  profile_type: Profile;
  created_at: string;
  last_message_at: string | null;
};

export type ChatMessageRow = {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tool_calls: unknown | null;
  created_at: string;
};

export type EmailLogRow = {
  id: string;
  user_id: string;
  kind: 'threshold_alert' | 'scheduled' | 'daily_cap_notice' | 'verification';
  recipient: string;
  subject: string;
  body_md: string | null;
  related_state: string | null;
  related_city: string | null;
  related_place: string | null;
  related_when: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';
  resend_id: string | null;
  failure_reason: string | null;
  created_at: string;
};

export type EmailQuotaRow = {
  user_id: string;
  quota_date: string;
  count: number;
  last_sent_at: string | null;
};