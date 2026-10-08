"""
Groq LLM client for Aira AI.

Two endpoints:
  - generate_advisory(profile, place, aqi, forecast) -> str
      Produces a ~150-word profile-tailored health advisory for the Advisory page.
      Cached per (place, profile, hour) in advisory_view.

  - compare_areas(place_a, profile, aqi_a, forecast_a, place_b, aqi_b, forecast_b) -> str
      Produces a plain-text comparison report for the Compare page. Uses live
      data the chat route just fetched (NOT cached). The output is a 1-2
      paragraph, profile-tailored comparison highlighting which place is
      better for the user's profile TODAY, with citation references to the
      data the chat route just fetched.

Environment: GROQ_API_KEY must be set. The default model is
qwen/qwen3-32b, with openai/gpt-oss-120b as fallback if the primary
returns 429 or 5xx more than twice. The originally specified
llama-3.1-70b-versatile was decommissioned by Groq in 2026.

This module is the ONLY place that calls Groq. The chat route is in
TypeScript (apps/web/lib/chat/) and uses the tool pattern from §6.6.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx


PRIMARY_MODEL = "openai/gpt-oss-20b"
FALLBACK_MODEL = "openai/gpt-oss-120b"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_TEMP = 0.3
MAX_TOKENS_ADVISORY = 350
MAX_TOKENS_COMPARE = 600
TIMEOUT_S = 20.0


@dataclass
class GroqMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


def _api_key() -> str:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY env var is not set")
    return key


def _post(messages: List[GroqMessage], model: str, max_tokens: int) -> str:
    payload = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
        "temperature": DEFAULT_TEMP,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=TIMEOUT_S) as client:
        r = client.post(GROQ_API_URL, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
    message = data["choices"][0]["message"]
    text = (message.get("content") or message.get("reasoning") or "").strip()
    if not text:
        raise RuntimeError(f"Groq model {model} returned empty content")
    return text


def _post_with_fallback(messages: List[GroqMessage], max_tokens: int) -> Tuple[str, str]:
    """Try primary, fall back to secondary on 429/5xx. Returns (content, model_used)."""
    for model, attempts in [(PRIMARY_MODEL, 2), (FALLBACK_MODEL, 2)]:
        for attempt in range(attempts):
            try:
                content = _post(messages, model, max_tokens)
                return content, model
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (429, 500, 502, 503, 504) and attempt < attempts - 1:
                    time.sleep(2 ** attempt)  # 1s, 2s
                    continue
                if e.response.status_code in (404, 429, 500, 502, 503, 504):
                    break  # try fallback model
                raise
            except httpx.TimeoutException:
                if attempt < attempts - 1:
                    time.sleep(1)
                    continue
                break
    raise RuntimeError("Groq API: all models and retries exhausted")


# --- System prompt (shared) -------------------------------------------------

ADVISORY_SCOPE = """You are Aira, the air quality assistant for Aira AI.
- You answer ONLY about air quality, health implications, forecasts, and air-pollution-related topics.
- You DO NOT answer general knowledge, history, math, coding, recipes, jokes, or any non-AQI topic.
- You DO NOT speculate about places you have no data for.
- You DO NOT give medical diagnoses; you translate AQI numbers into general health guidance and recommend the user consult a doctor for personal medical advice.
- You always cite the data source in parentheses: (CPCB live), (forecast v1-linreg-30d), or (advisory history).
- You do not use emojis. You write in plain English, 1-3 sentences for an advisory.
"""


def _build_advisory_messages(
    profile: str, place_name: str, aqi: float, bucket: str,
    dominant: str, profile_line: str, forecast_summary: str,
) -> List[GroqMessage]:
    """Build the system + user message for an advisory generation call."""
    user = f"""Generate a ~150-word advisory for:
- Profile: {profile}
- Place: {place_name}
- Current AQI: {aqi:.0f} ({bucket})
- Dominant pollutant: {dominant}
- Today's general guidance for this profile: "{profile_line}"
- Next 3 days: {forecast_summary}

Constraints:
- Plain English, no jargon, 1-3 short paragraphs.
- Tailor the tone to the profile (e.g. for a child profile, be reassuring and direct; for an elderly profile, be calm and emphasize rest).
- Mention what to do today (avoid outdoor exertion, wear N95, prefer morning walks, etc.).
- Mention what to expect for the next 2-3 days at a high level.
- Close with a one-sentence reminder that this is general guidance and personal medical advice comes from a doctor.
"""
    return [
        GroqMessage("system", ADVISORY_SCOPE),
        GroqMessage("user", user),
    ]


def generate_advisory(
    profile: str, place_name: str, aqi: float, bucket: str, dominant: str,
    profile_line: str, forecast_summary: str,
) -> Tuple[str, str]:
    """Generate an advisory. Returns (text, model_used)."""
    msgs = _build_advisory_messages(
        profile, place_name, aqi, bucket, dominant, profile_line, forecast_summary)
    return _post_with_fallback(msgs, MAX_TOKENS_ADVISORY)


# --- Compare (the user's specific request) ----------------------------------

COMPARE_SCOPE = """You are Aira, the air quality assistant for Aira AI.
You are comparing two places for a user. The user has a specific health profile.

You will be given:
- The user's profile (child / healthy adult / elderly / asthmatic)
- Both place names, their current AQI, their bucket, and their dominant pollutant
- The 7-day forecast peak for each place
- 6 pollutant values for each place
- The user's recent advisory history (last 5 advisories)

Your job: write a 1-2 paragraph plain-text comparison that:
- Picks which place is better for the user's profile today and clearly says so in the FIRST sentence.
- Quantifies the gap (e.g. "Bandra's AQI is 28 points higher than Borivali's").
- Cites the dominant pollutant that's driving the gap.
- Mentions one practical implication: morning window, mask use, indoor vs outdoor activity, etc.
- Closes with a one-sentence caveat: "For personal medical advice, consult a doctor."

You are NOT allowed to:
- Speculate about causes of AQI changes you can't verify from the data.
- Recommend one place over the other based on anything other than the data given.
- Use emojis.
- Write more than 200 words.
"""


def _build_compare_messages(
    profile: str,
    place_a: dict, place_b: dict,
    profile_line: str,
) -> List[GroqMessage]:
    """Build the system + user message for a compare generation call."""
    user = f"""User profile: {profile}
General guidance for this profile: "{profile_line}"

Place A: {place_a['name']} (Maharashtra, India)
  - Current AQI: {place_a['aqi']:.0f} ({place_a['bucket']})
  - Dominant pollutant: {place_a['dominant']}
  - 7-day forecast peak: {place_a['forecast_peak']:.0f}
  - Pollutants: PM2.5={place_a['pm25']}, PM10={place_a['pm10']}, NO2={place_a['no2']}, SO2={place_a['so2']}, CO={place_a['co']}, O3={place_a['o3']}

Place B: {place_b['name']} (Maharashtra, India)
  - Current AQI: {place_b['aqi']:.0f} ({place_b['bucket']})
  - Dominant pollutant: {place_b['dominant']}
  - 7-day forecast peak: {place_b['forecast_peak']:.0f}
  - Pollutants: PM2.5={place_b['pm25']}, PM10={place_b['pm10']}, NO2={place_b['no2']}, SO2={place_b['so2']}, CO={place_b['co']}, O3={place_b['o3']}

Write the comparison now.
"""
    return [
        GroqMessage("system", COMPARE_SCOPE),
        GroqMessage("user", user),
    ]


def generate_compare_report(
    profile: str,
    place_a: dict, place_b: dict,
    profile_line: str,
) -> Tuple[str, str]:
    """Generate the Compare-page report. Returns (text, model_used).
    Data MUST be live (the caller passes the data it just fetched from /aqi/*).
    This call is NEVER cached.
    """
    msgs = _build_compare_messages(profile, place_a, place_b, profile_line)
    return _post_with_fallback(msgs, MAX_TOKENS_COMPARE)


# --- CLI smoke test ----------------------------------------------------------

if __name__ == "__main__":
    # Smoke test only when GROQ_API_KEY is set
    if not os.environ.get("GROQ_API_KEY"):
        print("GROQ_API_KEY not set; skipping smoke test")
    else:
        text, model = generate_advisory(
            profile="child",
            place_name="Borivali, Mumbai",
            aqi=142.0, bucket="Moderate", dominant="pm25",
            profile_line="Children's lungs are still developing — consider shorter outdoor play sessions.",
            forecast_summary="Tomorrow 148, Friday 165, Saturday 158 — trending Poor by Friday.",
        )
        print(f"=== Advisory (model={model}) ===")
        print(text)
        print()
        text2, model2 = generate_compare_report(
            profile="asthmatic",
            place_a={
                "name": "Borivali, Mumbai", "aqi": 142.0, "bucket": "Moderate",
                "dominant": "pm25", "forecast_peak": 165.0,
                "pm25": 38, "pm10": 92, "no2": 22, "so2": 7, "co": 0.8, "o3": 41,
            },
            place_b={
                "name": "Andheri, Mumbai", "aqi": 168.0, "bucket": "Poor",
                "dominant": "pm25", "forecast_peak": 195.0,
                "pm25": 71, "pm10": 128, "no2": 33, "so2": 9, "co": 1.2, "o3": 38,
            },
            profile_line="Outdoor air will likely trigger symptoms. Stay indoors, windows closed.",
        )
        print(f"=== Compare (model={model2}) ===")
        print(text2)
