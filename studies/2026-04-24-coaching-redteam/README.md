# Coaching-quality red team — 2026-04-24

## Why

The calibration arc (closed 2026-04-23) verified that **scoring** is consistent and accurate. That answered "does the rubric grade pitches the same way every time?" It did not answer the harder question: **does the coaching itself hit the quality bar?**

The bar is the L7-trainer quote in `LEARNINGS.md`:
> *"This is the depth of feedback I would expect from a sales manager with 15–20 years of experience."*

That bar is qualitative. Scoring stdev tells you nothing about whether the coaching prose reads like a seasoned manager wrote it or like plausible-sounding LLM output.

## Method

1. Capture live `/api/evaluate` output for all three demo pitches (weak / mid / strong) against prod.
2. Run a second Claude call with a "20-yr enablement leader at a major cloud company" persona, asked to critique *the coaching* (not the pitch). Bar set explicitly to "what a senior sales coach would write," not "plausible feedback."
3. Critic produces structured output: depth score 1–10, gaps the coaching missed (with the exact wording a real coach would use), things the coaching got right, and a single "one cut."

Each iteration of the prompt gets its own subfolder so the depth scores can be tracked over time.

## Iterations

### v1-baseline (2026-04-24)

System prompt as it stood at commit `eb7a8f3`. Three pitches, three critiques.

| Pitch | Eval score | Critic depth |
|---|---|---|
| weak | 20/100 | **5/10** |
| mid | 74/100 | **5/10** |
| strong | 100/100 | **5/10** |

Five patterns identified across the critiques: no posture read, no tactical sales-craft, no discovery instinct, treats symptoms as separate problems, praise inflation when rubric is satisfied. See LEARNINGS entry 2026-04-24 for the synthesis.

### v2-posture-instruction (2026-04-24)

Added a posture-read instruction to `overall_impression` (commit `9e7a697`). Hypothesis: when posture is load-bearing, name it explicitly; otherwise stay in the structural read.

| Pitch | Eval score | Critic depth | Δ from v1 |
|---|---|---|---|
| weak | 20/100 | **7/10** | **+2** ✅ |
| mid | 72/100 | 5/10 | 0 (correct null — posture wasn't the lever) |
| strong | 100/100 | **4/10** | **−1** (regression — see below) |

**Verdict:** the targeted intervention worked exactly as designed on the case it was designed for. The strong-pitch regression came from the new "posture as a strength" line ("posture is confident without being performative") compounding the praise-inflation pattern that was already the dominant gap on rubric-satisfied pitches. That points cleanly at Pattern 5 as the next iteration target.

## What's next

**v3 candidate: praise-inflation correction.** Instruction shape: a pitch that meets every rubric criterion can still have tactical issues a senior coach would catch — score the rubric, then look one layer deeper. Same `overall_impression` slot. Should directly fix the v2 strong-pitch regression and is the dominant gap on high-scoring pitches.

## Files

- `v1-baseline/critique-{weak,mid,strong}.md` — raw critic output, baseline.
- `v2-posture-instruction/critique-{weak,mid,strong}.md` — raw critic output after posture instruction added.

The critic system prompt is summarized in LEARNINGS.md; the script that ran it is ephemeral (lives outside the repo).
