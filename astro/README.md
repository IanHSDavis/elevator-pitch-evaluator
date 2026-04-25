# Astronomer integration

This directory contains an [Astronomer Astro](https://www.astronomer.io/) project with one [Apache Airflow](https://airflow.apache.org/) DAG that runs nightly regression checks against the deployed Elevator Pitch Evaluator.

> **Branch context:** this code lives on the `astronomer-integration` branch. The `main` branch is a lean Next.js app with no orchestration layer. The Astro integration was added as an experiment to evaluate whether DAG-based scheduling adds durable value beyond the immediate use case.

## What's in here

```
astro/
├── dags/
│   └── elevator_pitch_calibration_check.py    # the DAG
├── tests/
│   └── dags/
│       └── test_dag_integrity.py              # parses the DAG, checks structure
├── Dockerfile                                  # Astro Runtime base image
├── requirements.txt                            # Python deps (just `requests`)
└── packages.txt                                # OS-level deps (none)
```

## The DAG: `elevator_pitch_calibration_check`

**Purpose:** every night at 8:00 UTC, hit the production `/api/evaluate` endpoint with the three reference demo pitches (weak / mid / strong), compare each rubric score against its calibrated baseline, and fail the run if any score drifts beyond ±5 points.

**Why it exists:** the evaluator is Claude-powered, and the system prompt is iterated on actively (see `LEARNINGS.md` and `studies/`). A single-sentence change to the prompt can shift the rubric scores without anyone realizing it. The 2026-04-23 calibration arc proved scoring is deterministic *today*. This DAG is the early-warning system that catches drift *tomorrow*.

**Shape:**

```
            ┌──────────────────┐
            │  evaluate_weak   │──┐
            └──────────────────┘  │
            ┌──────────────────┐  │   ┌──────────────┐
            │   evaluate_mid   │──┼──▶│ check_drift  │
            └──────────────────┘  │   └──────────────┘
            ┌──────────────────┐  │
            │ evaluate_strong  │──┘
            └──────────────────┘
```

Three parallel HTTP calls fan into one drift-check task. The drift-check task either prints a clean summary (all within tolerance) or raises `AirflowException` with a human-readable diagnostic — a failed run shows up red in the Astro UI and triggers email/Slack alerts if the workspace is configured for them.

**Why this is a good fit for a DAG (vs. a shell script + cron):**

1. **Parallelism.** Each evaluation is ~30s of Claude latency. Three sequential = 90s; three parallel = 30s. Airflow expresses this in three lines of code.
2. **Retries with backoff.** Anthropic occasionally returns 529 (overloaded). Airflow's per-task retry policy handles transient failures cleanly. `cron + curl` would either no-op silently or false-alarm.
3. **Observability.** Every run is a structured artifact in the Astro UI — task logs, xcom output, drift values over time. No separate logging pipeline.

## Running it

### Option A — cloud-only (no local install)

If you have an [Astro Cloud](https://www.astronomer.io/) account, you can deploy this project without installing anything locally:

1. Connect your Astro workspace to this repo's `astronomer-integration` branch via the Astro Cloud UI.
2. Astro deploys the project automatically; the DAG appears in the workspace.
3. The first run kicks off at 8:00 UTC, or you can trigger one manually from the UI.

### Option B — local development

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) and the [Astro CLI](https://www.astronomer.io/docs/astro/cli/install-cli):

```bash
# from this directory:
astro dev start
```

That spins up a local Airflow instance on `localhost:8080`. The DAG appears in the UI; you can trigger it manually to verify the API call against production succeeds.

```bash
# run the DAG-integrity tests without spinning up Airflow:
astro dev pytest tests/
```

## Drift baseline maintenance

`DEMO_PITCHES` in the DAG file pins each pitch's expected score. When you intentionally change the rubric (e.g., adjusting subscores in `src/lib/evaluate.ts`), update the baselines in the same commit so the DAG passes on the new equilibrium. Any unintentional change shows up the next morning as a red task.

## What this is not

- It's not a replacement for the per-iteration red-team measurement loop (see `studies/2026-04-24-coaching-redteam/`). That measures *coaching depth*, which is a qualitative judgment from a senior-coach persona. This DAG only watches *rubric scores*, which are the one thing that should never silently change.
- It's not a CI hook. CI runs on every push; this runs nightly. The two are complementary — CI catches regressions in code, this catches regressions in model behavior.

## Future DAGs (candidates, not yet built)

- `weekly_red_team_loop` — runs the senior-coach critic against current coaching, scores depth, files a critique into `studies/` automatically.
- `usage_aggregation` — pulls evaluation logs, aggregates by pitch tier, writes weekly digest.
- `prompt_diff_monitor` — when `src/lib/evaluate.ts` changes on `main`, kicks off the calibration check immediately rather than waiting for the next 8:00 UTC slot.
