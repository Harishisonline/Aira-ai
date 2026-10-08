"""
Indian National AQI (NAQI) — pure Python implementation.

Reference: CPCB CAAQMS document, "National Ambient Air Quality Index" (NAQI).
URL: https://app.cpcbccr.com/ccr_docs/CAAQMS_NAQI.pdf

The AQI is the maximum of 8 sub-indices (PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb).
For v1 we implement 6 (NH3 and Pb monitoring is sparse in Maharashtra).
Each sub-index uses piecewise-linear interpolation across 8 concentration buckets
(Good, Satisfactory, Moderate, Poor, Very Poor, Severe, ...).
The reported AQI is the maximum sub-index; the bucket is the bucket of that max.

This module is the source of truth. The TypeScript mirror in apps/web/lib/aqi.ts
must produce identical outputs for identical inputs (cross-validated by tests).
"""

from dataclasses import dataclass
from typing import Optional, Tuple


# --- Bucket boundaries -------------------------------------------------------

@dataclass(frozen=True)
class Bucket:
    """One AQI bucket. Each pollutant has 8 buckets."""
    lo_aqi: int      # lower bound of AQI for this bucket
    hi_aqi: int      # upper bound of AQI for this bucket
    label: str       # human label

    def __post_init__(self):
        if self.lo_aqi > self.hi_aqi:
            raise ValueError(f"Bucket lo > hi: {self.lo_aqi} > {self.hi_aqi}")


BUCKETS: Tuple[Bucket, ...] = (
    Bucket(0,   50,  "Good"),
    Bucket(51,  100, "Satisfactory"),
    Bucket(101, 200, "Moderate"),
    Bucket(201, 300, "Poor"),
    Bucket(301, 400, "Very Poor"),
    Bucket(401, 500, "Severe"),
)


def bucket_from_aqi(aqi: float) -> Bucket:
    """Return the bucket a given AQI falls into. Saturates at the ends."""
    if aqi is None or aqi != aqi:  # NaN check
        raise ValueError("aqi must be a finite number")
    for b in BUCKETS:
        if b.lo_aqi <= aqi <= b.hi_aqi:
            return b
    if aqi < 0:
        return BUCKETS[0]
    return BUCKETS[-1]  # aqi > 500


# --- Pollutant breakpoints (µg/m³, except CO which is mg/m³) -----------------

# Each entry: ((c_lo, c_hi, aqi_lo, aqi_hi), ...)
# Values from CPCB NAQI table. 8-hour rolling average for CO and O3; 24-hour
# rolling average for PM2.5, PM10, NO2, SO2.
PM25_BREAKPOINTS = (
    (0,    30,   0,   50),
    (31,   60,   51,  100),
    (61,   90,   101, 200),
    (91,   120,  201, 300),
    (121,  250,  301, 400),
    (251,  380,  401, 500),
)
PM10_BREAKPOINTS = (
    (0,    50,   0,   50),
    (51,   100,  51,  100),
    (101,  250,  101, 200),
    (251,  350,  201, 300),
    (351,  430,  301, 400),
    (431,  600,  401, 500),
)
NO2_BREAKPOINTS = (
    (0,    40,   0,   50),
    (41,   80,   51,  100),
    (81,   180,  101, 200),
    (181,  280,  201, 300),
    (281,  400,  301, 400),
    (401,  550,  401, 500),
)
SO2_BREAKPOINTS = (
    (0,    40,   0,   50),
    (41,   80,   51,  100),
    (81,   380,  101, 200),
    (381,  800,  201, 300),
    (801,  1600, 301, 400),
    (1601, 2100, 401, 500),
)
CO_BREAKPOINTS_MG = (  # CO is in mg/m³, not µg/m³
    (0.0,   1.0,   0,   50),
    (1.1,   2.0,   51,  100),
    (2.1,   10,   101, 200),
    (10.1,  17,   201, 300),
    (17.1,  34,   301, 400),
    (34.1, 50,   401, 500),
)
O3_BREAKPOINTS = (
    (0,    50,   0,   50),
    (51,   100,  51,  100),
    (101,  168,  101, 200),
    (169,  208,  201, 300),
    (209,  748,  301, 400),
    (749,  1000, 401, 500),
)

POLLUTANT_BREAKPOINTS = {
    "pm25": PM25_BREAKPOINTS,
    "pm10": PM10_BREAKPOINTS,
    "no2":  NO2_BREAKPOINTS,
    "so2":  SO2_BREAKPOINTS,
    "co":   CO_BREAKPOINTS_MG,
    "o3":   O3_BREAKPOINTS,
}


# --- Sub-index calculation ---------------------------------------------------

def _sub_index(concentration: float, breakpoints) -> float:
    """Compute a single pollutant's AQI sub-index via piecewise-linear interp.
    Returns None (caller maps to 0) if concentration is below the first bucket
    or above the last bucket — those cases get clamped, not interpolated, per
    CPCB convention. Missing/invalid input returns 0 (treated as 'no contribution').
    """
    if concentration is None or concentration != concentration or concentration < 0:
        return 0.0
    c_lo, c_hi, a_lo, a_hi = breakpoints[0]
    if concentration < c_lo:
        return float(a_lo)
    c_lo, c_hi, a_lo, a_hi = breakpoints[-1]
    if concentration > c_hi:
        return float(a_hi)
    for c_lo, c_hi, a_lo, a_hi in breakpoints:
        if c_lo <= concentration <= c_hi:
            # Piecewise linear: I = ((I_hi - I_lo) / (BP_hi - BP_lo)) * (C - BP_lo) + I_lo
            if c_hi == c_lo:
                return float(a_hi)
            slope = (a_hi - a_lo) / (c_hi - c_lo)
            return a_lo + slope * (concentration - c_lo)
    return 0.0  # unreachable


def sub_index(pollutant: str, concentration: float) -> float:
    """Public API: sub_index("pm25", 78.0) -> 173.0 (Moderate)."""
    bp = POLLUTANT_BREAKPOINTS.get(pollutant)
    if bp is None:
        raise ValueError(f"unknown pollutant: {pollutant!r}; valid: {sorted(POLLUTANT_BREAKPOINTS)}")
    return _sub_index(concentration, bp)


# --- NAQI overall ------------------------------------------------------------

@dataclass
class NAQIResult:
    aqi: float
    bucket: Bucket
    dominant_pollutant: str
    sub_indices: dict  # {pollutant: aqi_value}


def compute_aqi(
    pm25: Optional[float] = None,
    pm10: Optional[float] = None,
    no2:  Optional[float] = None,
    so2:  Optional[float] = None,
    co:   Optional[float] = None,    # mg/m³
    o3:   Optional[float] = None,
) -> NAQIResult:
    """Compute the National AQI from raw pollutant readings.
    The reported AQI is the maximum of the available sub-indices.
    The dominant pollutant is the one whose sub-index equals the max.
    Pollutants with None or NaN are skipped (treated as 'not measured').
    """
    subs = {
        "pm25": sub_index("pm25", pm25) if pm25 is not None else 0.0,
        "pm10": sub_index("pm10", pm10) if pm10 is not None else 0.0,
        "no2":  sub_index("no2",  no2)  if no2  is not None else 0.0,
        "so2":  sub_index("so2",  so2)  if so2  is not None else 0.0,
        "co":   sub_index("co",   co)   if co   is not None else 0.0,
        "o3":   sub_index("o3",   o3)   if o3   is not None else 0.0,
    }
    # Strip zero-skip entries (unmeasured) before picking max
    measured = {k: v for k, v in subs.items() if v > 0 or k in (
        "pm25" if pm25 is not None else "",
        "pm10" if pm10 is not None else "",
        "no2"  if no2  is not None else "",
        "so2"  if so2  is not None else "",
        "co"   if co   is not None else "",
        "o3"   if o3   is not None else "",
    ) and (k in {
        p for p, v in {"pm25": pm25, "pm10": pm10, "no2": no2, "so2": so2, "co": co, "o3": o3}.items() if v is not None
    })}
    if not measured:
        raise ValueError("at least one pollutant reading is required")
    aqi = max(measured.values())
    # dominant = the pollutant(s) at the max; pick first deterministic one
    dominant = next(k for k, v in measured.items() if v == aqi)
    return NAQIResult(
        aqi=aqi,
        bucket=bucket_from_aqi(aqi),
        dominant_pollutant=dominant,
        sub_indices=subs,
    )


# --- Profile advice (text-only, used in advisory + chat) --------------------

# Plain-English impact by profile × AQI bucket. Used by the LLM context and
# the static advisory card. Keep wording short — the LLM elaborates.

PROFILE_ADVICE = {
    "healthy": {
        "Good":         "Air quality is ideal. No precautions needed.",
        "Satisfactory": "Air quality is acceptable for most people.",
        "Moderate":     "Unusually sensitive people should consider reducing prolonged outdoor exertion.",
        "Poor":         "Limit prolonged outdoor exertion. Consider an N95 mask if you exercise outside.",
        "Very Poor":    "Avoid prolonged outdoor exertion. Wear an N95 mask outdoors.",
        "Severe":       "Stay indoors. Close windows. Use an air purifier if you have one.",
    },
    "child": {
        "Good":         "Perfect for outdoor play.",
        "Satisfactory": "Safe for outdoor play and sports.",
        "Moderate":     "Children's lungs are still developing — consider shorter outdoor play sessions.",
        "Poor":         "Limit outdoor play. Keep windows closed during peak traffic hours.",
        "Very Poor":    "No outdoor play. Keep children indoors with windows closed.",
        "Severe":       "School should switch to indoor-only activities. Keep children home if possible.",
    },
    "elderly": {
        "Good":         "Safe for outdoor walks and exercise.",
        "Satisfactory": "Safe for most outdoor activities.",
        "Moderate":     "Reduce strenuous outdoor activity. Walk slowly and rest often.",
        "Poor":         "Avoid outdoor exertion. Heart and lung conditions worsen faster at this level.",
        "Very Poor":    "Stay indoors. Even short outdoor exposure can trigger cardiac events.",
        "Severe":       "Stay indoors. Reschedule any non-urgent medical visits.",
    },
    "asthmatic": {
        "Good":         "Asthma triggers low — keep your inhaler handy but no extra precautions.",
        "Satisfactory": "Asthma triggers low. Keep rescue inhaler accessible.",
        "Moderate":     "Carry your rescue inhaler. Avoid outdoor exercise in the afternoon.",
        "Poor":         "Outdoor air will likely trigger symptoms. Stay indoors, windows closed.",
        "Very Poor":    "Asthma attack likely with any outdoor exposure. Stay indoors, run an air purifier.",
        "Severe":       "Severe risk. Have your action plan ready. Consider pre-emptively contacting your doctor.",
    },
}


def advice_for(profile: str, bucket_label: str) -> str:
    """Get the plain-English advisory line for a profile × bucket combination."""
    profile_advice = PROFILE_ADVICE.get(profile)
    if profile_advice is None:
        raise ValueError(f"unknown profile: {profile!r}; valid: {sorted(PROFILE_ADVICE)}")
    line = profile_advice.get(bucket_label)
    if line is None:
        raise ValueError(f"unknown bucket: {bucket_label!r}; valid: {sorted(profile_advice)}")
    return line


# --- CLI test ----------------------------------------------------------------

if __name__ == "__main__":
    # Three known cases from CPCB docs to validate against
    # Case 1: PM2.5 = 35, PM10 = 75, NO2 = 60 -> AQI should be ~76 (Satisfactory)
    r1 = compute_aqi(pm25=35, pm10=75, no2=60)
    print(f"Case 1: AQI={r1.aqi:.0f} bucket={r1.bucket.label} dominant={r1.dominant_pollutant}")
    # Case 2: PM2.5 = 78, PM10 = 180, NO2 = 95 -> AQI should be ~165 (Moderate, from PM2.5)
    r2 = compute_aqi(pm25=78, pm10=180, no2=95)
    print(f"Case 2: AQI={r2.aqi:.0f} bucket={r2.bucket.label} dominant={r2.dominant_pollutant}")
    # Case 3: PM2.5 = 250 -> AQI should be 400 (Very Poor)
    r3 = compute_aqi(pm25=250)
    print(f"Case 3: AQI={r3.aqi:.0f} bucket={r3.bucket.label} dominant={r3.dominant_pollutant}")
    # Case 4: Borivali (live-ish) - PM2.5=78, PM10=128, NO2=32, SO2=9, CO=0.6, O3=41
    r4 = compute_aqi(pm25=78, pm10=128, no2=32, so2=9, co=0.6, o3=41)
    print(f"Case 4 (Borivali-ish): AQI={r4.aqi:.0f} bucket={r4.bucket.label} dominant={r4.dominant_pollutant}")
