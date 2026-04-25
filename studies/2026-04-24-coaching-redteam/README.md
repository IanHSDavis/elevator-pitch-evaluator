# Coaching-quality red team — 2026-04-24

## Why

The calibration arc (closed 2026-04-23) verified that **scoring** is consistent and accurate. That answered "does the rubric grade pitches the same way every time?" It did not answer the harder question: **does the coaching itself hit the quality bar?**

The bar is the L7-trainer quote in `LEARNINGS.md`:
> *"This is the depth of feedback I would expect from a sales manager with 15–20 years of experience."*

That bar is qualitative. Scoring stdev tells you nothing about whether the coaching prose reads like a seasoned manager wrote it or like plausible-sounding LLM output.

## Method

1. Captured live `/api/evaluate` output for all three demo pitches (weak / mid / strong) against prod.
2. Ran a second Claude call with a "20-yr enablement leader at a major cloud company" persona, asked to critique *the coaching* (not the pitch). Bar set explicitly to "what a senior sales coach would write," not "plausible feedback."
3. Critic produces structured output: depth score 1–10, gaps the coaching missed (with the exact wording a real coach would use), things the coaching got right, and a single "one cut."

Critic system prompt is checked in via the script that produced these artifacts (run was ephemeral; prompt is summarized in LEARNINGS entry for the date).

## Headline result

| Pitch | Eval score | Critic depth score |
|---|---|---|
| weak | 20/100 | 5/10 |
| mid | 74/100 | 5/10 |
| strong | 100/100 | 5/10 |

All three coaching outputs scored 5/10 — including the one that gave the pitch itself a perfect score. The tool is competent but not seasoned. The L7-trainer bar is not yet hit.

## Files

- `critique-weak.md`, `critique-mid.md`, `critique-strong.md` — raw critic output per pitch.

## Patterns identified

See LEARNINGS.md entry for 2026-04-24 for the synthesis and the prompt-engineering roadmap that came out of these critiques.
