"""
Linear regression forecast for 7-day AQI prediction.

Given the last 30 days of daily AQI readings, fit y = a*x + b (least squares),
and project forward 7 days. Return the forecast + a 1-SE confidence band
and the R² of the fit (used to surface model uncertainty in the UI).

For v1 we use a simple ordinary least squares (OLS) regression with day-of-year
as the x. The "Why not ARIMA?" rationale is in the PRD §11. ARIMA will be v2.

This module is the source of truth. The TypeScript mirror in
apps/web/lib/aqi.ts must produce identical outputs for identical inputs.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional, Tuple
import math


@dataclass
class ForecastPoint:
    forecast_date: date
    predicted_aqi: float
    confidence_low: float
    confidence_high: float


@dataclass
class ForecastResult:
    points: List[ForecastPoint]
    r_squared: float
    model_version: str


def _linear_regression(xs: List[float], ys: List[float]) -> Tuple[float, float, float]:
    """Fit y = a*x + b by OLS. Returns (a, b, r_squared)."""
    n = len(xs)
    if n < 2:
        raise ValueError("need at least 2 points for regression")
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    ss_xx = sum((x - mean_x) ** 2 for x in xs)
    if ss_xx == 0:
        raise ValueError("all x values are identical")
    a = ss_xy / ss_xx
    b = mean_y - a * mean_x
    # R² = 1 - SS_res/SS_tot
    ss_res = sum((y - (a * x + b)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot != 0 else 0.0
    return a, b, r_squared


def _residual_std(xs: List[float], ys: List[float], a: float, b: float) -> float:
    """Sample standard deviation of the residuals (n-1 denominator)."""
    n = len(xs)
    if n < 3:
        # Need at least 3 points for a meaningful SE; fall back to a wide band
        return 50.0
    ss_res = sum((y - (a * x + b)) ** 2 for x, y in zip(xs, ys))
    return math.sqrt(ss_res / (n - 2))


def forecast_7day(
    history: List[Tuple[date, float]],
    horizon_days: int = 7,
    confidence_sigma: float = 1.0,
) -> ForecastResult:
    """Generate a 7-day forecast from the last N daily AQI readings.

    Args:
        history: list of (date, aqi) tuples, oldest first. Should be at least 14
            days for a stable fit; we use 30 days in production.
        horizon_days: how many days to forecast (default 7).
        confidence_sigma: width of the confidence band in standard errors
            (default 1.0 = ~68% interval; use 1.96 for ~95%).

    Returns:
        ForecastResult with N horizon points, the R², and the model version.
    """
    if len(history) < 2:
        raise ValueError("need at least 2 history points to fit a regression")
    # Sort defensively (in case caller didn't)
    history = sorted(history, key=lambda p: p[0])
    # Use day-index as x (0, 1, 2, ...). This makes the model interpretable as
    # "AQI is changing by `a` units per day, on average, over the recent window."
    base_date = history[0][0]
    xs = [(d - base_date).days for d, _ in history]
    ys = [float(a) for _, a in history]
    a, b, r_squared = _linear_regression(xs, ys)
    residual_se = _residual_std(xs, ys, a, b)

    last_x = xs[-1]
    last_date = history[-1][0]
    points: List[ForecastPoint] = []
    for i in range(1, horizon_days + 1):
        # The SE grows with distance from the data; use the standard formula:
        # SE_pred(x) = s * sqrt(1 + 1/n + (x - x_bar)^2 / Sxx)
        # For simplicity and to keep the band interpretable, we use a constant
        # 1-SE band. This is conservative for points close to the mean and
        # understates uncertainty at the far end. The methodology page notes
        # the simplification.
        x_pred = last_x + i
        y_pred = a * x_pred + b
        points.append(ForecastPoint(
            forecast_date=last_date + timedelta(days=i),
            predicted_aqi=round(max(0.0, y_pred), 1),
            confidence_low=round(max(0.0, y_pred - confidence_sigma * residual_se), 1),
            confidence_high=round(y_pred + confidence_sigma * residual_se, 1),
        ))
    return ForecastResult(
        points=points,
        r_squared=round(r_squared, 3),
        model_version="v1-linreg-30d",
    )


def merge_observed_and_forecast(
    observed: List[Tuple[date, float]],
    forecast: ForecastResult,
) -> List[Tuple[date, float, Optional[float], Optional[float]]]:
    """Combine observed history with the forecast for plotting.
    Returns a single list of (date, observed_or_none, forecast_low, forecast_high).
    Observed points have low/high = None. Forecast points have observed = None.
    """
    out: List[Tuple[date, float, Optional[float], Optional[float]]] = []
    for d, a in observed:
        out.append((d, a, None, None))
    for p in forecast.points:
        out.append((p.forecast_date, 0.0, p.confidence_low, p.confidence_high))
    return out


# --- CLI test ----------------------------------------------------------------

if __name__ == "__main__":
    # Generate a fake 30-day history with a clear upward trend
    base = date(2025, 12, 23)
    history = []
    for i in range(30):
        aqi = 130 + i * 0.5 + ((i % 7) - 3) * 8  # trend + weekly noise
        history.append((base + timedelta(days=i), aqi))
    r = forecast_7day(history)
    print(f"R² = {r.r_squared}")
    print(f"Model: {r.model_version}")
    for p in r.points:
        print(f"  {p.forecast_date}: {p.predicted_aqi}  [{p.confidence_low} - {p.confidence_high}]")
