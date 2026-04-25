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

### v4-one-cut (2026-04-25)

Added a "make the cut, don't hand the rep a menu" instruction to the per-dimension `coaching` field (commit `f6be4e6`). Hypothesis: pattern 4 was the dominant remaining gap across all three v3 critiques. Instruction shape: when you'd otherwise write "e.g. X or Y" / "consider X or Y," pick the single rewrite you'd hand the rep verbatim and commit.

| Pitch | Eval score | Critic depth | Δ from v3 |
|---|---|---|---|
| weak | 20/100 | 6/10 | −0.5 (noise) |
| mid | 82/100 | 6/10 | 0 |
| strong | 100/100 | 7/10 | 0 |

**Verdict:** the targeted intervention worked at the pattern level but the depth score didn't move. v3 critiques flagged "menu instead of cut" in **all three** critiques explicitly. v4 critiques don't flag it in any of them — the per-dimension coaching now reads as committed single-option rewrites (e.g., weak's CTA: "Open with one specific question: 'Are conversion drops something your team is actively losing sleep over?' Then shut up and let them answer."). The critic moved to new gaps:
- **weak**: rep doesn't have a wording problem, has a discovery problem — coaching should send them to talk to customers before rewriting
- **mid**: no named proof attached to "20% reduction"; "our customers" is a faceless plural; CTA inflated to 5/5 then coached as if it weren't
- **strong**: persona mismatch — opens with CFO pain that's actually security-lead pain ("CFOs don't chase engineers, compliance leads do"); no named logo on the proof point; coaching never produces a literal full-pitch rewrite

**The methodological lesson:** depth-score plateaus are real. The critic always finds *something* at this level, so once a pattern is fixed it just shifts to the next. The signal is in *which patterns the critic stops naming*, not in the score moving up. The "one cut" pattern is verifiably gone from all three critiques — that's the win, even though the headline number didn't move.

**New finding from v4 critic — persona mismatch in the strong demo pitch.** "CFOs at growth-stage fintechs spend six weeks chasing engineers for audit evidence" — but CFOs sign the check; compliance leads / Heads of Security feel that pain daily. This is a buyer-persona issue in the demo pitch fixture itself, not the coaching. Pair it with the already-flagged "six weeks vs eight weeks" numerical inconsistency: `src/lib/demoPitch.ts` needs a small revision pass independent of the coaching iteration.

Three-iteration trajectory: average critic depth across the three pitches moved 5.0 (v1) → 5.3 (v2) → 6.5 (v3) → 6.33 (v4). The first three iterations delivered clear gains; v4 closed a specific pattern without moving the headline. That's the natural ceiling shape — pattern-by-pattern wins, scores plateau.

## What's next

**v5 candidate: full-script handoff.** v4 strong critique called out "Three 'try' suggestions, zero rewrites of the actual pitch — coaching that doesn't produce a literal new script doesn't change Monday morning behavior." That's the same shape as the menu-vs-cut pattern but one level up: instead of "pick one rewrite per beat," the critic wants "give the rep their new pitch, top to bottom." Possible instruction: when overall_impression diagnoses the pitch as rubric-clean-with-tactical-issues, end with one full rewritten pitch the rep can read aloud Monday morning. Risk: might make the output too prescriptive for weak/mid pitches where the rep needs to do the work. Probably gates on rubric satisfaction, like the v3 praise-inflation guard.

Separately, fix the demo pitch fixture: numerical inconsistency (6w vs 8w) + persona mismatch (CFO pain that's actually security-lead pain).

## Files

- `v1-baseline/critique-{weak,mid,strong}.md` — raw critic output, baseline.
- `v2-posture-instruction/critique-{weak,mid,strong}.md` — raw critic output after posture instruction added.
- `v3-praise-inflation-guard/critique-{weak,mid,strong}.md` — raw critic output after praise-inflation guard added.
- `v4-one-cut/critique-{weak,mid,strong}.md` — raw critic output after one-cut instruction added.

The critic system prompt is summarized in LEARNINGS.md; the script that ran it is ephemeral (lives outside the repo).
