"""
elevator_pitch_calibration_check
================================

Nightly regression-detection DAG for the Elevator Pitch Evaluator.

WHY THIS EXISTS
---------------
The evaluator is a Claude-powered scoring tool. When you change the
system prompt — even by a single sentence — you can shift the rubric
scores it produces without realizing it. The "calibration" arc closed
in `studies/2026-04-23-calibration` verified that the scorer is
deterministic *today*. This DAG is the early-warning system that says:
*is it still deterministic tomorrow, after the next prompt iteration?*

It does this by hitting the live `/api/evaluate` endpoint with our
three reference demo pitches (weak / mid / strong), comparing the
returned score against a pinned baseline, and failing the run if any
pitch drifts beyond a tolerance band. The DAG fires at 7:30 AM ET
daily — inside the deployment's 7–9 AM ET wake window — so a failed
run is the first thing visible in the Astro UI when the operator
checks at the start of their day.

WHY THIS IS A GOOD FIT FOR A DAG
--------------------------------
Three reasons that map to standard Airflow strengths:

1. **Parallelism.** Each pitch evaluation is independent and ~30s of
   wall time (Claude latency). Three sequential calls = 90s; three
   parallel calls = 30s. Airflow's task graph makes the parallelism
   trivial to express.

2. **Scheduling + retries.** Anthropic occasionally returns 529
   (overloaded). A nightly cron with retry/backoff handles transient
   upstream failures cleanly without bespoke infrastructure.

3. **Observability.** Every run produces a structured artifact (task
   logs + xcom). Drift over time becomes visible without a separate
   logging pipeline — the Astro UI is the dashboard.

WHAT IT REPLACES
----------------
Before this DAG existed, the same check was run by `curl` in a shell
loop (see studies/2026-04-23-calibration/run-baseline-sweep.sh). That
was fine for a one-time study — it's wrong as a recurring guard
because nothing watches it, retries it, or alerts on drift.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pendulum
import requests
from airflow.decorators import dag, task
from airflow.exceptions import AirflowException

# All schedules in this DAG are interpreted in Eastern time so that the
# fire window stays inside the deployment's 7–9 AM ET wake schedule
# year-round, regardless of DST. Airflow uses pendulum for tz-aware
# scheduling — anchoring start_date with this tz makes the cron string
# Eastern-relative.
LOCAL_TZ = pendulum.timezone("America/New_York")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE = "https://elevator-pitch-evaluator.vercel.app"

# `?skip_notify=1` suppresses the admin email so the nightly sweep
# doesn't burn the Resend daily quota. The endpoint is intentionally
# open so calibration studies can hit it without auth.
EVALUATE_ENDPOINT = f"{API_BASE}/api/evaluate?skip_notify=1"

# Timeout per /api/evaluate call. The endpoint runs Whisper (skipped
# for transcript-only requests like this one) + Claude Opus, so 120s
# is the conservative ceiling that matches the API's own maxDuration.
REQUEST_TIMEOUT_SEC = 120

# Drift tolerance. The rubric is deterministic at temperature 0, so
# any nonzero drift is a signal — but we allow ±5 to absorb token-level
# variance without crying wolf.
DRIFT_THRESHOLD = 5

# Reference pitches mirror src/lib/demoPitch.ts. They live here as
# fixtures so this DAG is self-contained — it does not depend on the
# Next.js codebase being importable.
#
# `expected_score` is the calibrated baseline as of 2026-04-25. When
# you intentionally change the rubric or scoring logic, update these
# values in the same commit so the DAG passes on the new baseline.
DEMO_PITCHES: dict[str, dict] = {
    "weak": {
        "transcript": (
            "Hey so uh we're building this AI platform. It's really "
            "innovative and leverages cutting-edge technology. It can "
            "do basically anything you need — we have customers in "
            "healthcare, finance, retail, you name it. The UI is "
            "beautiful and it's really easy to use. We just had a big "
            "launch and our traction is great. Anyway, I think you'd "
            "like it, you should check it out."
        ),
        "duration_seconds": 28,
        "expected_score": 20,
    },
    "mid": {
        "transcript": (
            "Hi, I'm Jordan, and I run a small SaaS company called "
            "TrackTide. Most companies struggle to understand their "
            "customer churn — they see numbers go up and down but "
            "can't really figure out why. We built a platform that "
            "connects to your CRM and customer success tools and "
            "tells you in plain language which customers are at risk "
            "and why. It's helped our customers reduce churn by about "
            "20% on average. Would love to grab 15 minutes next week "
            "to show you how it could work for your team."
        ),
        "duration_seconds": 55,
        "expected_score": 82,
    },
    "strong": {
        "transcript": (
            "I'm Maya, founder of Lintel — the compliance wedge for "
            "mid-market fintechs preparing their first SOC 2. Most "
            "CFOs at growth-stage fintechs spend six weeks chasing "
            "engineers for audit evidence while their runway burns; "
            "the audit slips by a quarter and their Series B timeline "
            "slips with it. Lintel auto-collects evidence from your "
            "cloud stack, maps it to the audit controls, and flags "
            "gaps before the auditor does — we've cut "
            "time-to-audit-ready from eight weeks to ten days with "
            "our first twelve customers. I know your team just closed "
            "a B round and compliance prep is on next quarter's plan. "
            "Can I grab twenty minutes Thursday or Friday to walk "
            "your team through a live demo?"
        ),
        "duration_seconds": 62,
        "expected_score": 100,
    },
}


# ---------------------------------------------------------------------------
# DAG
# ---------------------------------------------------------------------------

@dag(
    dag_id="elevator_pitch_calibration_check",
    description=(
        "Daily regression check: scores the three reference demo pitches "
        "against the live /api/evaluate endpoint and fails the run if any "
        "score drifts beyond ±5 points from its calibrated baseline."
    ),
    # 7:30 AM Eastern, every day. Anchored to America/New_York via
    # start_date so DST shifts don't drift us out of the deployment's
    # 7–9 AM ET wake window. 30-minute lead-in lets the deployment
    # warm up after wake; 1.5 hours after gives room for retries
    # before hibernation kicks back in at 9 AM. The deployment is
    # billed only while awake, so the schedule and the wake window
    # are effectively the same contract — change one, change the other.
    schedule="30 7 * * *",
    start_date=datetime(2026, 4, 25, tzinfo=LOCAL_TZ),
    catchup=False,
    max_active_runs=1,
    tags=["elevator-pitch-evaluator", "calibration", "regression-detection"],
    default_args={
        # One retry handles transient Anthropic 529s. Two would mask
        # a real outage; zero would be too jumpy.
        "retries": 1,
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
    },
    doc_md=__doc__,
)
def calibration_check_dag():
    """Build the DAG graph: three parallel evaluations, one drift gate."""

    @task
    def evaluate_pitch(tier: str) -> dict:
        """
        POST one demo pitch to /api/evaluate and return a result dict.

        Returns a dict the downstream task can read directly off xcom
        — keep it small and JSON-serializable.
        """
        pitch = DEMO_PITCHES[tier]
        response = requests.post(
            EVALUATE_ENDPOINT,
            json={
                "transcript": pitch["transcript"],
                "durationSeconds": pitch["duration_seconds"],
            },
            timeout=REQUEST_TIMEOUT_SEC,
        )
        response.raise_for_status()
        body = response.json()

        actual = body["overallScore"]
        expected = pitch["expected_score"]
        drift = abs(actual - expected)

        print(
            f"[{tier}] score={actual} baseline={expected} "
            f"drift={drift} verdict={body.get('verdict', '<no verdict>')}"
        )

        return {
            "tier": tier,
            "score": actual,
            "expected": expected,
            "drift": drift,
            "verdict": body.get("verdict"),
        }

    @task
    def check_drift(results: list[dict]) -> dict:
        """
        Fail the run if any pitch drifts beyond DRIFT_THRESHOLD.

        Failure surfaces in the Astro UI as a red task and (if alerts
        are configured) emails the on-call. The exception message is
        the alert payload — keep it human-readable.
        """
        flagged = [r for r in results if r["drift"] > DRIFT_THRESHOLD]

        summary_lines = [
            f"  {r['tier']:>6}: {r['score']:>3}  "
            f"(baseline {r['expected']:>3}, drift {r['drift']:>2})"
            for r in results
        ]
        summary = "\n".join(summary_lines)

        if flagged:
            tiers = ", ".join(f"'{r['tier']}'" for r in flagged)
            raise AirflowException(
                f"Calibration drift detected on {tiers} "
                f"(threshold ±{DRIFT_THRESHOLD}):\n{summary}\n\n"
                "Either the rubric scoring has shifted unintentionally, or "
                "the baseline in DEMO_PITCHES needs to be updated to match "
                "an intentional change. Inspect the prompt diff in the most "
                "recent commits to /src/lib/evaluate.ts."
            )

        print(
            f"All three pitches within ±{DRIFT_THRESHOLD} of baseline. "
            f"Calibration holding.\n{summary}"
        )
        return {"flagged": [], "results": results}

    # Three parallel evaluations. Airflow infers the dependency from
    # the function call into check_drift — no explicit `>>` needed.
    weak = evaluate_pitch.override(task_id="evaluate_weak")("weak")
    mid = evaluate_pitch.override(task_id="evaluate_mid")("mid")
    strong = evaluate_pitch.override(task_id="evaluate_strong")("strong")

    check_drift([weak, mid, strong])


calibration_check_dag()
