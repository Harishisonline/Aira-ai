"""
Aira AI -- unified backtest runner.

Runs all 5 backtests in sequence and produces a unified report.
  [1] apps/worker/app/compute/naqi.py             -- Python NAQI math
  [2] tests/test_aqi_consistency.py               -- Python vs TS breakpoints
  [3] tests/worker_smoke.py                        -- In-process worker HTTP
  [4] tests/backtest_backend.py                    -- Database schema + REST + RPC
  [5] tests/test_worker_http.py                    -- Worker endpoints against live data

Run:  python3 /Users/harish/Downloads/aira-ai/tests/run_all_backtests.py
"""

import os
import subprocess
import sys
from pathlib import Path

REPO = Path("/Users/harish/Downloads/aira-ai")
TESTS = REPO / "tests"

os.environ["SUPABASE_TOKEN"] = os.environ.get("SUPABASE_TOKEN", "sbp_fcc7f64b8b72eea5eaa37a74759abae36f640342")


def run(name: str, cmd: list[str], cwd: Path = REPO, env_extra: dict | None = None) -> tuple[int, str]:
    env = {**os.environ, **(env_extra or {})}
    print(f"\n{'='*70}")
    print(f"  {name}")
    print(f"  $ {' '.join(cmd)}")
    print(f"{'='*70}")
    try:
        r = subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=300)
        # Show last 20 lines of stdout
        lines = r.stdout.strip().split("\n")
        for line in lines[-20:]:
            print(f"  {line}")
        if r.returncode != 0:
            print(f"  STDERR: {r.stderr[-500:]}")
        return r.returncode, r.stdout
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT")
        return 124, ""


def main():
    print("=" * 70)
    print("AIRA AI -- UNIFIED BACKTEST RUNNER")
    print("=" * 70)
    print(f"Repo: {REPO}")
    print(f"Supabase project: svqugnhrcwugdjgobdqs")
    print()

    results = []

    # 1. NAQI math
    code, out = run("[1/5] NAQI math smoke", ["python3", "apps/worker/app/compute/naqi.py"])
    ok = code == 0 and "Very Poor" in out
    results.append(("NAQI math", ok))

    # 2. Cross-language consistency
    code, out = run("[2/5] Python vs TS NAQI consistency", ["python3", "tests/test_aqi_consistency.py"])
    ok = code == 0 and "PASS" in out and "FAIL" not in out
    results.append(("Cross-language", ok))

    # 3. Worker smoke (in-process)
    code, out = run("[3/5] Worker HTTP smoke (in-process)", ["python3", "tests/worker_smoke.py"])
    ok = code == 0 and "PASS" in out
    results.append(("Worker smoke", ok))

    # 4. Backend + database backtest
    code, out = run("[4/5] Backend + database backtest (live Supabase)",
                     ["python3", "tests/backtest_backend.py"],
                     env_extra={"SUPABASE_TOKEN": os.environ["SUPABASE_TOKEN"]})
    # Extract pass/fail count
    ok = code == 0 and "RESULT: " in out and "0 failed" in out.split("RESULT: ")[-1]
    results.append(("Backend+DB", ok))

    # 5. Worker HTTP integration
    code, out = run("[5/5] Worker HTTP integration (live data)",
                     ["python3", "tests/test_worker_http.py"],
                     env_extra={"SUPABASE_TOKEN": os.environ["SUPABASE_TOKEN"]})
    ok = code == 0 and "RESULT: " in out and "0 failed" in out.split("RESULT: ")[-1]
    results.append(("Worker HTTP", ok))

    # Summary
    print("\n" + "=" * 70)
    print("UNIFIED BACKTEST SUMMARY")
    print("=" * 70)
    all_pass = True
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")
        if not ok:
            all_pass = False
    print("=" * 70)
    if all_pass:
        print("ALL 5 BACKTESTS GREEN")
    else:
        print(f"{sum(1 for _, ok in results if not ok)} BACKTEST(S) FAILED")
    print("=" * 70)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()