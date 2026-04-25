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

### v3-praise-inflation-guard (2026-04-25)

Added a "look one layer deeper when the rubric is fully satisfied" instruction to `overall_impression` (commit `000caaf`). Hypothesis: strong-pitch coaching surfaces the tactical issues a senior coach catches; mid and weak unchanged because the instruction only triggers on rubric-satisfied pitches.

| Pitch | Eval score | Critic depth | Δ from v2 |
|---|---|---|---|
| weak | 20/100 | 6.5/10 | −0.5 (noise; same critique pattern as v2) |
| mid | 82/100 | 6/10 | +1 |
| strong | 100/100 | **7/10** | **+3** ✅ |

**Verdict:** large targeted gain. Strong pitch's `overall_impression` now contains all four catches the v2 critic identified (founder-voice "wedge," "first twelve customers" tell, surveilling-vs-researched line, no discovery before the ask). v3 critic explicitly acknowledges: *"Better than typical tool output — it actually names tactical tells like 'wedge' and 'first twelve customers'."*

Two-iteration trajectory: average critic depth across the three pitches moved from 5.0 (v1) → 5.3 (v2) → 6.5 (v3). The iterate-and-measure loop is delivering measurable depth gains.

Brand-new finding from v3 critic: the strong demo pitch itself has a **numerical inconsistency** ("six weeks chasing engineers" in the problem vs "eight weeks to ten days" in the value prop) that no prior critic caught and the tool didn't either. Worth fixing in `src/lib/demoPitch.ts` separately from the coaching iteration.

## What's next

**v4 candidate: "one cut, not menus" instruction.** Pattern 4 is now the dominant remaining gap — appears in all three v3 critiques. Instruction shape: when the coaching would otherwise list two or three options ("e.g. ...", "or ..."), name the single highest-leverage one and stop. Ships in the per-dimension `coaching` field instructions, not `overall_impression`, which keeps the slot diversification clean (we've now used overall_impression for posture and praise-inflation; per-dimension is the next natural place).

## Files

- `v1-baseline/critique-{weak,mid,strong}.md` — raw critic output, baseline.
- `v2-posture-instruction/critique-{weak,mid,strong}.md` — raw critic output after posture instruction added.
- `v3-praise-inflation-guard/critique-{weak,mid,strong}.md` — raw critic output after praise-inflation guard added.

The critic system prompt is summarized in LEARNINGS.md; the script that ran it is ephemeral (lives outside the repo).
