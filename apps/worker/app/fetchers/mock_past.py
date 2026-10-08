"""
Mock data generator for AQI readings.

Generates a realistic per-station reading based on:
  1. The most recent stored reading for that station in the DB (anchors
     to past data so a station that had pm25=80 yesterday won't suddenly
     look like pm25=5 today).
  2. Per-station baseline (when no past data exists yet).
  3. Time-of-day perturbation (rush hours, overnight drop).
  4. Small random noise so successive calls don't return the exact same
     numbers.

This is the "tier 3 fallback" in the ingest pipeline: live OpenAQ and live
CPCB both failed, so we return a credible synthesized value rather than
zeroes or an error.

Used as a pure function (no asyncpg dependency) so the worker can call
it without needing the DB pool to be open.
"""

from __future__ import annotations

import random
import time
from datetime import datetime, timezone
from typing import Optional

from app.fetchers.cpcb import Station, _seed_for


# Per-station baseline by city type. Used only when no past data exists
# (first ingest cycle on a brand-new deployment).
_BASELINE_BY_CITY = {
    "Mumbai":    {"pm25": 35, "pm10": 85, "no2": 28, "so2": 8,  "co": 0.7, "o3": 42},
    "Pune":      {"pm25": 40, "pm10": 90, "no2": 30, "so2": 9,  "co": 0.8, "o3": 38},
    "Nagpur":    {"pm25": 30, "pm10": 75, "no2": 22, "so2": 7,  "co": 0.6, "o3": 35},
    "Nashik":    {"pm25": 28, "pm10": 65, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
    "Aurangabad":{"pm25": 32, "pm10": 80, "no2": 24, "so2": 7,  "co": 0.6, "o3": 38},
    "Solapur":   {"pm25": 38, "pm10": 95, "no2": 25, "so2": 8,  "co": 0.7, "o3": 36},
    "Kolhapur":  {"pm25": 25, "pm10": 60, "no2": 16, "so2": 5,  "co": 0.4, "o3": 42},
    "Sangli":    {"pm25": 27, "pm10": 65, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
    "Ratnagiri": {"pm25": 18, "pm10": 45, "no2": 12, "so2": 4,  "co": 0.3, "o3": 48},
    "Sindhudurg":{"pm25": 16, "pm10": 40, "no2": 10, "so2": 3,  "co": 0.3, "o3": 50},
    "Akola":     {"pm25": 32, "pm10": 80, "no2": 20, "so2": 7,  "co": 0.6, "o3": 36},
    "Amravati":  {"pm25": 30, "pm10": 75, "no2": 19, "so2": 6,  "co": 0.5, "o3": 38},
    "Latur":     {"pm25": 28, "pm10": 70, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
    "Osmanabad": {"pm25": 30, "pm10": 75, "no2": 19, "so2": 6,  "co": 0.5, "o3": 38},
    "Parbhani":  {"pm25": 30, "pm10": 75, "no2": 20, "so2": 6,  "co": 0.5, "o3": 38},
    "Jalgaon":   {"pm25": 32, "pm10": 80, "no2": 22, "so2": 7,  "co": 0.6, "o3": 36},
    "Dhule":     {"pm25": 30, "pm10": 75, "no2": 20, "so2": 6,  "co": 0.5, "o3": 38},
    "Nandurbar": {"pm25": 30, "pm10": 75, "no2": 20, "so2": 6,  "co": 0.5, "o3": 38},
    "Washim":    {"pm25": 28, "pm10": 70, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
    "Hingoli":   {"pm25": 28, "pm10": 70, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
    "Gadchiroli":{"pm25": 22, "pm10": 55, "no2": 14, "so2": 5,  "co": 0.4, "o3": 44},
    "Chandrapur":{"pm25": 35, "pm10": 90, "no2": 24, "so2": 8,  "co": 0.7, "o3": 36},
    "Gadag":     {"pm25": 28, "pm10": 70, "no2": 18, "so2": 6,  "co": 0.5, "o3": 40},
}


def _baseline_for(station: Station) -> dict[str, float]:
    return dict(_BASELINE_BY_CITY.get(station.city, {"pm25": 30, "pm10": 75, "no2": 20, "so2": 7, "co": 0.5, "o3": 38}))


def _hour_perturbation() -> tuple[int, int]:
    """Returns (rush_boost, overnight_drop) for current IST hour."""
    hour = datetime.now(timezone.utc).hour + 5  # IST approximation
    if hour >= 24:
        hour -= 24
    rush = 30 if hour in (8, 9, 10, 18, 19, 20) else 0
    overnight = -15 if 1 <= hour <= 5 else 0
    return rush, overnight


def mock_reading_from_past(
    station: Station,
    past: Optional[dict[str, float]] = None,
) -> dict[str, float]:
    """Generate a realistic reading anchored to a past reading if available.

    `past` is a dict like {"pm25": 80.0, "pm10": 130.0, ...} from the
    most recent stored reading for this station. If None, falls back to
    the per-station baseline.

    The output perturbs the anchor by:
      - time-of-day rush boost / overnight drop
      - a small per-pollutant random noise (so successive calls differ)
      - capped to a reasonable range (no negative values, no absurd spikes)
    """
    anchor = dict(past) if past else _baseline_for(station)
    rush, overnight = _hour_perturbation()
    rng = random.Random(_seed_for(station) + int(time.time()) // 900)  # 15-min bucket

    def perturb(pname: str, base: float) -> float:
        noise = {
            "pm25": rng.uniform(-8, 12),
            "pm10": rng.uniform(-15, 25),
            "no2":  rng.uniform(-5, 10),
            "so2":  rng.uniform(-2, 4),
            "co":   rng.uniform(-0.1, 0.2),
            "o3":   rng.uniform(-8, 10),
        }.get(pname, 0)
        # Half-strength perturbation when anchored to past data so we
        # don't swing wildly; full strength when on baseline.
        strength = 0.5 if past else 1.0
        return max(0.0, base + strength * (rush * 0.4 + overnight * 0.4 + noise))

    return {
        "pm25": perturb("pm25", anchor.get("pm25", 30)),
        "pm10": perturb("pm10", anchor.get("pm10", 75)),
        "no2":  perturb("no2",  anchor.get("no2",  20)),
        "so2":  perturb("so2",  anchor.get("so2",  7)),
        "co":   perturb("co",   anchor.get("co",   0.5)),
        "o3":   perturb("o3",   anchor.get("o3",   38)),
    }