# Evaluation Rubric

The rubric is a 5-dimension × 3-level matrix. Each pitch is scored independently on each dimension; specificity and clarity of language are evaluated within each dimension rather than as a separate category.

The level labels (**Exceeds / Meets / Developing**) are intentionally coaching-oriented. The output is feedback, not a verdict.

## Dimensions

| Dimension | Exceeds | Meets | Developing |
|---|---|---|---|
| **Opening & Credibility Frame** | Immediately establishes who they are and what they offer with specific, memorable language | Establishes identity and offering clearly within the first 15 seconds | Vague or delayed opening; listener unclear on who is speaking or what is being offered |
| **Customer Problem Identification** | Names a specific, recognizable pain point with enough detail to signal genuine customer understanding | Identifies a customer need or problem, even if somewhat broadly | Generic or missing; pitch leads with solution before establishing the problem |
| **Value Proposition** | Clearly and specifically connects the solution to the stated problem; listener knows exactly what is being offered and why it matters | Solution is present and relevant to the problem, even if the connection could be sharper | Solution stated but disconnected from the problem, or leads with features rather than outcomes |
| **Call to Action** | Ends with a specific, natural next step that advances the conversation | Ends with some form of invitation or next step | Pitch ends abruptly or trails off with no clear direction |
| **Timing** | Within the 45–90 second target window | Within 15 seconds of the target zone on either side (30–45s or 90–105s) | Significantly under or over — either too brief to be credible or too long to hold attention |

## Scoring

Each dimension is evaluated twice, by design:

1. **Level** — the coarse-grained verdict (`Exceeds` / `Meets` / `Developing`). Chosen from the descriptor that best matches what was said.
2. **Subscore** — an integer 1–5 within that level (Exceeds → 4–5, Meets → 3–4, Developing → 1–2). This is Claude's precision read inside the level's range — a borderline Meets lands at 3, a strong Meets at 4.

Dimensions are weighted:

| Dimension | Weight |
|---|---|
| Opening & Credibility Frame | 20% |
| Customer Problem Identification | 25% |
| Value Proposition | 25% |
| Call to Action | 20% |
| Timing | 10% |

**Overall score** = Σ (subscore / 5) × weight × 100 — producing a 0–100 headline number. The verdict band:

- 75–100 → Exceeds
- 55–74 → Meets
- 0–54 → Developing

## Design notes

**Why these five dimensions?** They cover the full arc of a pitch: opening, problem, solution, close, and constraint. Dropping any one leaves a gap a real-world evaluator would flag.

**Why is timing auto-scored?** A prior version of this system (built on a third-party platform) relied on transcripts alone and couldn't measure actual pitch duration — the rubric had to soften to "roughly between 1 and 2 minutes." With Whisper returning transcribed audio and the browser measuring duration at record-time, timing becomes a precise, objective dimension rather than a guess. Because it's auto-scored, Claude doesn't touch it — it's computed from the measured duration.

**Why fold specificity and clarity into each dimension rather than making them their own row?** A pitch can be specific about the customer's problem while being vague about the solution. Treating specificity as a per-dimension modifier surfaces *where* the pitch went fuzzy, which is more actionable for coaching than a single global "clarity" score.

**Why three levels and not four?** Earlier iterations considered adding a fourth level (e.g., `Strong`/`Weak` at the ends), but three levels keep the rubric a coaching instrument rather than a judgment instrument. "Developing" is the honest floor — it names the growth area without calling the pitch bad. The subscore provides the intra-level gradient.

**Why weight the dimensions unevenly?** Customer problem and value proposition do the heaviest narrative work in a pitch — if those land, the pitch tends to work, and if they don't, nothing else saves it. Opening and close bracket the pitch; timing is a constraint rather than a driver. The weights reflect that editorial judgment, not a mathematical optimum.

**Output philosophy.** The evaluator returns four things per dimension: the level, the subscore, an evidence quote, and coaching language tied to what the speaker actually said. The level and subscore tell you where you landed. The coaching tells you what to do about it. The evidence keeps the coaching honest — it must reference language the speaker used, not fabricated examples.

A **single emblematic phrase per dimension** is also returned and highlighted in the transcript, creating a two-way link between the pitch text and the rubric feedback. Click a highlight to jump to the coaching note; read the coaching and the evidence quote connects back to where that judgment came from.
