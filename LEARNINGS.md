# Build Log

A public journal of what shipped, what pain from the Highspot-based system I built at AWS got addressed, and what I learned making this. This is a portfolio piece — the post-mortem is part of the artifact.

Entries are newest-first. Each ships-log entry is dated; each friction-smoothed and learning entry is grounded in a specific moment in the build.

---

## Ships log

### 2026-04-23 — Demo selector + calibration generalization study

Added two new demo pitches alongside the existing TrackTide: a deliberately-weak one (no identity, no problem, feature dump, vague close, 28s) and a deliberately-strong one (specific role, anchored problem, mechanism + outcome with proof, optioned CTA, 62s). Landing page now shows a small "Or try a demo: weak · mid · strong" selector.

Then ran the 20-sample baseline on each new pitch (40 additional calls) to verify the calibration shipped earlier today generalizes beyond TrackTide. Results:

- **Weak pitch: 20/100 every time.** All 4 dimensions + timing = developing. Verdict: "A product demo in search of a problem, an audience, and an ask."
- **Mid pitch (TrackTide): 82/100 every time.** (Unchanged from earlier study.)
- **Strong pitch: 100/100 every time.** All 4 dimensions + timing = exceeds. Verdict: "A tight, specific pitch that earns every beat from hook to ask."

Stdev 0.0 on all three. The rubric genuinely spans 0–100 and the calibration holds across the full quality range. The "default to meets unless X" guidance isn't overfit to TrackTide-specific wording — it's operating on structural pitch characteristics (role anchoring, mechanism + outcome, specific CTA).

Commit: [`3b97df7`](https://github.com/IanHSDavis/elevator-pitch-evaluator/commit/3b97df7).

### 2026-04-23 — Scoring calibration

Demo pitch ran 20 times showed overall scores in the 77–87 range on *identical input*. Stdev 3.6, 10-point spread. Embarrassing for a tool whose whole purpose is calibration.

Ran a formal baseline study, localized the variance to two mechanisms:
1. **Intra-level subscore drift.** Schema let Claude pick a 1–5 subscore within a level (Exceeds = 4 or 5, Meets = 3 or 4). Borderline pitches flipped 3↔4 run-to-run.
2. **Level flips on borderline dimensions.** Opening & Credibility and Customer Problem flipped meets↔exceeds in 25–30% of runs — the TrackTide framing sits exactly on the boundary of both.

Two targeted fixes:
- **Removed subscore from Claude's output schema.** Now derived in code from level (`exceeds=5, meets=3, developing=1`). Kills intra-level variance entirely.
- **Added explicit meets-vs-exceeds boundary guidance** to the system prompt for Opening and Customer Problem, with the TrackTide-style framing called out as meets-tier. Default-to-meets tie-breaker reinforced.

Re-ran the 20-sample baseline. Stdev 0.0. Every single run scored 82/100 exactly. Bonus: Claude also got more honest — pre-fix verdicts called this pitch "tight, well-shaped"; post-fix verdicts correctly read it as "clean but generic." Calibration didn't just reduce drift; it made the scoring more accurate to the pitch's actual weaknesses.

Details: [`/tmp/epe-baseline/REPORT.md`](#) (baseline), [`/tmp/epe-baseline2/REPORT.md`](#) (post-fix). Commit: [`885a458`](https://github.com/IanHSDavis/elevator-pitch-evaluator/commit/885a458).

### 2026-04-23 — OG preview image

Pasting the URL into Slack or LinkedIn rendered as a bare link — fine for a test deploy, anemic for a portfolio piece. Added a 1200×630 OG image that mirrors the landing hero exactly: serif "Say it in *sixty* seconds.", JetBrains Mono brand + meta, paper-and-ink palette. Built with Next.js's `opengraph-image.tsx` convention, fonts loaded from Google Fonts inside Satori.

First render had the brand mark overlapping the wordmark at small sizes (iMessage crops aggressively). Dropped the mark — wordmark carries the identity by itself. Simpler is stronger at thumbnail scale.

### 2026-04-23 — Email notifications for admin review

Testing-with-colleagues phase needs a way to review submissions without building an admin dashboard. Wired up Resend to fire a full coaching report to my inbox on every successful evaluation, subject line `Pitch submission · X/100 · Level` for scan-ability. Privacy copy on landing updated to "shared with the tool author for testing and calibration" — honest about the new data flow.

Most of the debug time was a case-sensitivity bug: I created the Vercel env var as `Resend_API_Key`, the code reads `process.env.RESEND_API_KEY`. Silent fail — no error logged (helper is written to be non-blocking). Fix was to delete and re-create with the correct name. Lesson: env-var name case matters; silent-skip patterns should log when they skip.

### 2026-04-22 — History / practice ledger

Added a History screen accessed from the topbar. Successful evaluations save to `localStorage` (cap 50, ~10KB each). The UI: stats header, a bar-chart sparkline colored by verdict band (green/blue/ochre) with "older → newer" left-to-right, a list of past sessions. Click a row to reopen its results view.

Deliberate choices:
- **No audio persistence.** Blob URLs die on page close, base64 would blow the localStorage quota. You re-record if you want to re-listen.
- **Left-to-right time axis.** So the eye reads improvement as upward movement over time.
- **Privacy copy in the footer.** "Stored locally · never sent to any server" — because it actually isn't.

### 2026-04-22 — Edge-case polish

Added a typed error screen with retry-that-preserves-audio, branched mic-permission errors (denied / no mic / busy), guarded against <8s recordings and near-silent transcripts before hitting Claude, and a 3-minute recording hard cutoff (Whisper caps uploads at 25MB). Each failure path now has specific copy instead of the generic "something went wrong."

### 2026-04-22 — Redesign from Claude Design handoff

Took the handoff bundle from Anthropic's Claude Design tool and implemented the whole thing in Next.js + Tailwind 4: four-screen architecture (landing / recording / processing / results), paper-and-ink OKLCH palette, Instrument Serif + Inter Tight + JetBrains Mono, expandable rubric matrix shared between landing and results, transcript with ochre-highlighted phrases cross-linked to rubric rows.

The handoff README had a design inconsistency: matrix headers showed 3 levels (Exceeds / Meets / Developing — matching my rubric IP) but badges in the rubric rows showed 4 (Strong / Meets / Developing / Weak). Had to resolve before building. Kept the 3-level rubric — it's coaching-oriented by design; adding "Weak" would shift it toward judgment. Rebranded nothing.

### 2026-04-22 — Audio capture + Whisper transcription

Browser-side MediaRecorder captures audio, uploads to a new `/api/transcribe` endpoint that forwards to Whisper and returns the transcript. Client chains into `/api/evaluate` with the transcript plus the *actual measured* recording duration, so timing gets scored precisely (see friction #1 below).

### 2026-04-22 — Initial evaluation pipeline

Next.js 16 scaffold, TypeScript, Tailwind 4, deployed to Vercel on push. Rubric module (`rubric.ts`), Zod schema for structured outputs, Claude Opus 4.7 via `messages.parse()` with adaptive thinking and effort:"high". System prompt carrying the full rubric is cached (`ephemeral` breakpoint) so repeated evaluations pay ~0.1× for the prefix. First working version: paste a transcript, get a rubric scorecard back.

---

## Friction from Highspot's version, smoothed

These are the specific "I hit this wall commercially; here's the fix" moments. Each is a defensible interview talk-track line.

### 1. Timing auto-scored from actual audio duration

**Highspot's version:** transcript-only, couldn't measure how long the speaker actually talked. The Timing dimension had to soften to "roughly between 1 and 2 minutes" because there was no ground truth.

**Here:** the browser measures recording duration precisely; timing gets scored against the 45–90s target window with real math, not vibes. One of the original design constraints the user insisted on.

### 2. Admin calibration via scannable inbox

**Highspot's version:** calibrating the evaluator across graders required manually watching dozens of videos and keeping handwritten notes to spot drift. Genuinely painful admin work.

**Here:** every submission emails the admin with the full report inline and the score in the subject line. Calibration becomes a reading exercise. Noticed during the calibration study (2026-04-23) that the scannable inbox was itself the calibration tool — I literally scrolled the subject lines to see the score spread.

### 3. Iteration is obvious, not hidden

**Highspot's version:** the option to re-record after feedback was a small, easy-to-miss trashcan icon. Users often didn't realize they could just try again — which broke the whole coaching loop pedagogically.

**Here:** "Record Again →" sits on the results footer as the primary action, right next to Copy Report. The top-of-page `← Back to record` link also handles the return path. The iterate-and-improve loop is the whole point of a coaching tool; it should be the most visible thing on the results screen.

---

## What I've learned

### Structural calibration generalizes; surface-level calibration doesn't

When I wrote the boundary guidance into the prompt, I was worried I'd overfit to TrackTide-specific wording ("I run a small SaaS company called TrackTide" → meets). Would the rule hold up against a pitch that said "I lead a seed-stage startup doing AI governance" or any other structurally-similar-but-lexically-different framing?

It does. The 3-pitch generalization study showed 0.0 stdev on weak (20/100), mid (82/100), and strong (100/100) — three structurally very different pitches. What the boundary guidance actually does isn't pattern-match surface vocabulary; it tells Claude *what structural signals* elevate a dimension from meets to exceeds (distinctive category frame, anchored persona, quantified frustration, mechanism + outcome, optioned CTA). Those signals cut across wording.

Generalizable lesson for rubric/prompt design: anchor your calibration language to structural signals, not to example-specific phrasing. Every concrete example in a prompt risks being overfit; the rule above the examples is what needs to be portable.

### The interesting variance lives in the subscore, not the level

Before the 20-sample baseline study I assumed Claude was disagreeing with itself about whether this pitch was Exceeds-tier or Meets-tier overall. Turns out it never did. The verdict level was "exceeds" in 100% of runs. The 10-point score spread lived entirely in the intra-level subscore drift and in two specific borderline dimensions. **Claude had a consistent read of the pitch; it just expressed that read with noisy numbers.**

This matters for human rater calibration too: if your rubric has level labels plus numeric scores, the numbers are where you'll find drift first, even if the qualitative reads agree.

### Deterministic derivation beats prompt-engineering the model into consistency

My first instinct with the subscore drift was "write better prompt guidance for picking the number." The actual fix was "remove the number from what the model picks." Let the model do qualitative work (which it's good at) and do the arithmetic in code (which is boring). Variance dropped to zero in one commit.

Generalizable lesson: when you catch yourself prompt-engineering the model to do arithmetic or apply deterministic rules, that's a signal the logic belongs in code, not in the prompt.

### Constraint can make Claude more honest, not less

Adding boundary guidance to the prompt (a "default to meets unless X" rule for borderline dimensions) not only stabilized the scoring, it also shifted the verdict tone from overgenerous to accurately critical. The same TrackTide pitch went from "tight, well-shaped" to "clear bones, generic skin." Before the fix Claude was apparently inflating borderline calls; after the fix it reads the pitch the way a human coach would.

Adding structure to Claude's decision space didn't flatten the coaching voice — it let the coaching voice engage with reality more honestly.

### The coaching text should still breathe

I kept the verdict sentence as a free-text field with only pattern hints. Claude produces 18–19 unique verdict sentences per 20 runs. That's working-as-designed — the verdict is a headline, not a scored field, and creativity there makes the tool feel alive rather than robotic. The calibration work targeted the *score* while deliberately leaving the *prose* free. A coaching tool that says the exact same thing every time for an identical input would feel broken even if the scoring is correct.

### Silent-skip is good UX, bad debug UX

My notify helper silently no-ops when env vars are missing. Correct behavior in production — a public fork or a misconfigured deploy should not break the evaluation path just because email isn't wired up. But it's awful when you're debugging why email isn't arriving.

Lesson: silent-skip should *log* when it skips, even if it doesn't raise. A single `console.warn("notify: skipping — no RESEND_API_KEY")` would have saved 30 minutes of debugging. Worth retrofitting.

---

## Open questions / next

- ~~**Does the calibration generalize?**~~ **Closed 2026-04-23.** Tested against weak (20/100), mid (82/100), and strong (100/100) pitches. Stdev 0 on all three. The structural framing holds across pitch style.
- **Is zero variance actually desirable?** For a scoring tool yes. For a coaching tool, maybe some variance in numerical call is fine if the coaching is consistent. The prose *is* varying run-to-run; only the score is frozen. Worth revisiting once a wider pitch corpus is in.
- **Boundary probing** — next calibration pass worth running: pitches that sit *intentionally* on rubric boundaries (e.g., a pitch with a specific role but no quantified frustration; a pitch with mechanism but no proof point). These three-pitch categories are easy cases at the extremes. The harder, more informative test is deliberately-borderline pitches.
- **Video coaching phase.** The next major feature — capture video, extract keyframes, score presence/eye-contact/delivery via Claude multimodal. Planned but not shipped. Mitigations (640×480 keyframes, 4 frames not 8, cached visual rubric) baked into the plan from day 1.
