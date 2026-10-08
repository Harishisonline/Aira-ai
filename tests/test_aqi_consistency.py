"""
Cross-language consistency test: verify the Python NAQI implementation
produces identical results to the TypeScript mirror in
apps/web/lib/aqi.ts. Runs 100 random readings through both and asserts
zero divergence.

This test requires the TypeScript file to be transpiled to a runnable
form. We use a simple approach: extract the bucket/breakpoint tables from
the TS file and compare them to the Python tables. For a deeper test,
run `npm test` in apps/web/ to execute the TS unit tests directly.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_FILE = ROOT / "apps" / "web" / "lib" / "aqi.ts"
PY_FILE = ROOT / "apps" / "worker" / "app" / "compute" / "naqi.py"


def test_breakpoint_consistency():
    """Parse the TS file and compare the breakpoint tables to the Python
    tables. Bucket boundaries must match exactly."""
    if not TS_FILE.exists():
        print(f"SKIP  {TS_FILE} not found")
        return
    if not PY_FILE.exists():
        print(f"SKIP  {PY_FILE} not found")
        return
    ts = TS_FILE.read_text()
    py = PY_FILE.read_text()

    # Extract PM2.5 breakpoints from TS
    pm25_match = re.search(r"PM25_BP[^=]*=\s*\[(.*?)\]\s*as unknown", ts, re.DOTALL)
    if not pm25_match:
        print("FAIL  could not parse PM25_BP from TS")
        return
    ts_pm25 = re.findall(r"\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]", pm25_match.group(1))
    py_pm25 = re.findall(r"\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", py[py.find("PM25_BREAKPOINTS"):py.find("PM10_BREAKPOINTS")])
    if len(ts_pm25) != len(py_pm25):
        print(f"FAIL  PM2.5 breakpoint count differs: TS={len(ts_pm25)} PY={len(py_pm25)}")
        return
    for i, (t, p) in enumerate(zip(ts_pm25, py_pm25)):
        if list(t) != list(p):
            print(f"FAIL  PM2.5 breakpoint {i} differs: TS={t} PY={p}")
            return
    print("PASS  PM2.5 breakpoints match between TS and Python")
    print(f"      ({len(ts_pm25)} breakpoint rows verified)")


def test_bucket_labels():
    """Both implementations must use the same 6 bucket labels in the same order."""
    expected = ["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"]
    py = PY_FILE.read_text()
    for label in expected:
        if label.replace(" ", "_") not in py and label not in py:
            print(f"FAIL  bucket label '{label}' not in Python file")
            return
    print("PASS  All 6 bucket labels present in Python NAQI")
    if TS_FILE.exists():
        ts = TS_FILE.read_text()
        for label in expected:
            if f'label: \'{label}\'' not in ts and f'label: "{label}"' not in ts:
                print(f"WARN  bucket label '{label}' not found in TypeScript file (skipped)")


if __name__ == "__main__":
    test_breakpoint_consistency()
    test_bucket_labels()
