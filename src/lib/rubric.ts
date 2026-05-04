export const PERFORMANCE_LEVELS = ["exceeds", "meets", "developing"] as const;
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];

export const LEVEL_LABELS: Record<PerformanceLevel, string> = {
  exceeds: "Exceeds",
  meets: "Meets",
  developing: "Developing",
};

// Matrix column accent colors — map to the badge palette.
// Exceeds uses the design's "strong" (green); Meets uses "meets" (blue);
// Developing uses "dev" (ochre). No fourth ("weak") level in our rubric.
export const LEVEL_PALETTE: Record<PerformanceLevel, "strong" | "meets" | "dev"> = {
  exceeds: "strong",
  meets: "meets",
  developing: "dev",
};

export type DimensionKey =
  | "opening_and_credibility"
  | "customer_problem"
  | "value_proposition"
  | "call_to_action";

// Visual dims are scored only when the user records video. Their keys live in
// a separate union so that audio-mode results can be typed without referencing
// fields that won't be present.
export type VisualDimensionKey =
  | "presence"
  | "eye_contact"
  | "delivery_confidence";

export type DimensionDefinition = {
  key: DimensionKey;
  index: number; // 1..4 — stable numbering used as highlight ref
  title: string;
  shortLabel: string; // 2–3 word strip label, e.g. "Opening & Credibility"
  shortSub: string; // 3–6 word caption, e.g. "Who you are, why listen."
  summary: string; // longer prose for system prompt
  weight: number; // 0..1, sums with TIMING.weight to 1.0 (audio-only mode)
  descriptors: Record<PerformanceLevel, string>;
};

export type VisualDimensionDefinition = {
  key: VisualDimensionKey;
  index: number; // 5..7 — continues numbering from audio dims
  title: string;
  shortLabel: string;
  shortSub: string;
  summary: string;
  weight: number; // 0..1, applies only when video is provided
  descriptors: Record<PerformanceLevel, string>;
};

export const DIMENSIONS: DimensionDefinition[] = [
  {
    key: "opening_and_credibility",
    index: 1,
    title: "Opening & Credibility Frame",
    shortLabel: "Opening & Credibility",
    shortSub: "Who you are, why listen.",
    summary:
      "Establishes who the speaker is and what they offer, ideally within the first 15 seconds.",
    weight: 0.2,
    descriptors: {
      exceeds:
        "Immediately establishes who they are and what they offer with specific, memorable language.",
      meets:
        "Establishes identity and offering clearly within the first 15 seconds.",
      developing:
        "Vague or delayed opening; listener unclear on who is speaking or what is being offered.",
    },
  },
  {
    key: "customer_problem",
    index: 2,
    title: "Customer Problem Identification",
    shortLabel: "Customer Problem",
    shortSub: "Specific, felt, named.",
    summary:
      "Names a specific, recognizable pain point or business need the listener can place themselves in.",
    weight: 0.25,
    descriptors: {
      exceeds:
        "Names a specific, recognizable pain point with enough detail to signal genuine customer understanding.",
      meets:
        "Identifies a customer need or problem, even if somewhat broadly.",
      developing:
        "Generic or missing; pitch leads with the solution before establishing the problem.",
    },
  },
  {
    key: "value_proposition",
    index: 3,
    title: "Value Proposition",
    shortLabel: "Value Proposition",
    shortSub: "Mechanism, not slogan.",
    summary:
      "Connects the solution to the stated problem — what the listener gets and why it matters.",
    weight: 0.25,
    descriptors: {
      exceeds:
        "Clearly and specifically connects the solution to the stated problem; listener knows exactly what is being offered and why it matters.",
      meets:
        "Solution is present and relevant to the problem, even if the connection could be sharper.",
      developing:
        "Solution stated but disconnected from the problem, or leads with features rather than outcomes.",
    },
  },
  {
    key: "call_to_action",
    index: 4,
    title: "Call to Action",
    shortLabel: "Call to Action",
    shortSub: "A door the listener can walk through.",
    summary:
      "Closes with a clear, natural next step that advances the conversation.",
    weight: 0.2,
    descriptors: {
      exceeds:
        "Ends with a specific, natural next step that advances the conversation.",
      meets: "Ends with some form of invitation or next step.",
      developing:
        "Pitch ends abruptly or trails off with no clear direction.",
    },
  },
];

export const TIMING = {
  targetMinSeconds: 45,
  targetMaxSeconds: 90,
  grayZoneSeconds: 15,
  weight: 0.1,
  title: "Timing",
  shortLabel: "Timing",
  shortSub: "Within the window.",
  summary:
    "Pitch falls inside the 45–90 second target window. Auto-scored from measured audio duration.",
  descriptors: {
    exceeds: "Within the 45–90 second target window.",
    meets:
      "Within 15 seconds of the target on either side (30–45s or 90–105s).",
    developing:
      "Significantly under or over — too brief to be credible or too long to hold attention.",
  },
} as const;

// Visual dims are evaluated from 4 evenly-spaced keyframes extracted from the
// recorded video. Critically, they are **coached but NOT scored** — they do
// not contribute to the overall /100 number and do not appear in the
// "X of Y dimensions meet" count. Three reasons:
//
// 1. Frame-based judgments are noisier than transcript-based ones. Lighting,
//    camera angle, and the four-frame sample window introduce variance that
//    the audio rubric (which works from a fixed transcript) doesn't have.
// 2. The scoring baseline was calibrated on transcript-only inputs (see
//    studies/2026-04-23-calibration). Folding visual scoring into the
//    overall would re-anchor the baseline silently and break the
//    calibration DAG's drift detection.
// 3. The visual coaching IS the value — not the grade. The point is to give
//    the speaker a concrete delivery note ("aim eyes at the lens, not the
//    monitor below"), not to dock 7 points off their score.
//
// `weight` on these definitions is therefore intentionally 0. We keep the
// field for shape-compatibility with DimensionDefinition; nothing reads it.
export const VISUAL_DIMENSIONS: VisualDimensionDefinition[] = [
  {
    key: "presence",
    index: 5,
    title: "Presence",
    shortLabel: "Presence",
    shortSub: "How you fill the frame.",
    summary:
      "Whether the speaker fills the frame purposefully — posture, framing, energy that registers visually before words land. Evaluated from the 4 keyframes as a whole.",
    weight: 0,
    descriptors: {
      exceeds:
        "Speaker fills the frame purposefully — head and shoulders well-composed, posture upright and engaged, energy reads visibly across multiple frames.",
      meets:
        "Speaker is properly framed and stably present, even if energy is neutral. Nothing about the visual presentation distracts from the words.",
      developing:
        "Off-center framing, slumped or closed posture, low visible energy, or framing that crops the speaker awkwardly (chin cut off, room ceiling dominating).",
    },
  },
  {
    key: "eye_contact",
    index: 6,
    title: "Eye Contact",
    shortLabel: "Eye Contact",
    shortSub: "Looking at the lens.",
    summary:
      "Whether the speaker's gaze is on the camera lens (proxy for buyer eye contact) versus reading notes off-screen, looking down, or letting eyes drift mid-thought. The single biggest tell of 'this is internalized' versus 'I'm reading.'",
    weight: 0,
    descriptors: {
      exceeds:
        "Eyes are aimed at the lens in all or nearly all keyframes — gaze direct, brief natural breaks only.",
      meets:
        "Eyes are camera-aimed in most keyframes, with at most one frame showing a glance away. Reads as engaged.",
      developing:
        "Gaze frequently away from the lens — reading off a screen below the camera, looking down at notes, eyes wandering. Reads as 'reciting' or 'unrehearsed.'",
    },
  },
  {
    key: "delivery_confidence",
    index: 7,
    title: "Delivery Confidence",
    shortLabel: "Delivery Confidence",
    shortSub: "Body language tells.",
    summary:
      "Whether visible body language telegraphs ownership of the pitch. Open posture, hands visible and used intentionally, lack of nervous tells. Distinct from vocal confidence — only what a still frame can show.",
    weight: 0,
    descriptors: {
      exceeds:
        "Open posture, hands visible and intentionally used (gesturing in frame), no visible nervous tells across the keyframes — the speaker looks like they own the room.",
      meets:
        "Settled posture, no distracting motion, hands either visibly at rest or gesturing without fidget. The frame doesn't actively undermine confidence even if it doesn't project it.",
      developing:
        "Closed or guarded posture, hands hidden or fidgeting, visible nervous tells (touching face, adjusting clothing, swaying out of frame). Body undermines what the words are trying to say.",
    },
  },
];

export type TimingResult = {
  level: PerformanceLevel;
  durationSeconds: number;
  note: string;
  badgeLabel: string; // short chip text: "Good" / "Short" / "Long"
};

export function scoreTiming(durationSeconds: number): TimingResult {
  const { targetMinSeconds, targetMaxSeconds, grayZoneSeconds } = TIMING;

  if (
    durationSeconds >= targetMinSeconds &&
    durationSeconds <= targetMaxSeconds
  ) {
    return {
      level: "exceeds",
      durationSeconds,
      badgeLabel: "In the window",
      note: `${durationSeconds.toFixed(0)}s · inside the 45–90s window.`,
    };
  }

  const lowerEdge = targetMinSeconds - grayZoneSeconds;
  const upperEdge = targetMaxSeconds + grayZoneSeconds;
  if (durationSeconds >= lowerEdge && durationSeconds <= upperEdge) {
    const tooShort = durationSeconds < targetMinSeconds;
    return {
      level: "meets",
      durationSeconds,
      badgeLabel: tooShort ? "A touch short" : "A touch long",
      note: `${durationSeconds.toFixed(0)}s · within 15s of the 45–90s target.`,
    };
  }

  const tooShort = durationSeconds < targetMinSeconds;
  return {
    level: "developing",
    durationSeconds,
    badgeLabel: tooShort ? "Short" : "Long",
    note: tooShort
      ? `${durationSeconds.toFixed(0)}s · too brief to land a full pitch.`
      : `${durationSeconds.toFixed(0)}s · too long to hold attention.`,
  };
}

// Subscore is derived deterministically from level. Claude returns level only
// — it doesn't pick a 1–5 subscore. This was an explicit calibration move:
// letting the model pick a subscore inside a level added run-to-run variance
// without adding useful signal, because the level already captures the
// scoring band and the coaching text captures the nuance.
export const LEVEL_TO_SUBSCORE: Record<PerformanceLevel, number> = {
  exceeds: 5,
  meets: 3,
  developing: 1,
};

export function subscoreForLevel(level: PerformanceLevel): number {
  return LEVEL_TO_SUBSCORE[level];
}

// Alias kept for clarity at call sites that specifically compute the timing
// subscore. Timing has always been level-only, unchanged here.
export const timingSubscore = subscoreForLevel;

// Overall /100 = Σ (subscore / 5) × weight × 100.
// Subscores are derived from per-dimension levels via subscoreForLevel.
// Visual dims are intentionally NOT included here — see the comment block on
// VISUAL_DIMENSIONS for why. The score stays anchored to the calibrated
// transcript-only baseline whether or not video was recorded.
export function overallScore(args: {
  dimensionLevels: Record<DimensionKey, PerformanceLevel>;
  timingLevel: PerformanceLevel;
}): number {
  let total = 0;
  for (const dim of DIMENSIONS) {
    const level = args.dimensionLevels[dim.key];
    total += (subscoreForLevel(level) / 5) * dim.weight;
  }
  total += (subscoreForLevel(args.timingLevel) / 5) * TIMING.weight;
  return Math.round(total * 100);
}

// Count how many dimensions landed at "meets" or "exceeds". Visual dims are
// excluded — they aren't part of the "X of Y dimensions meet" verdict line
// because they don't contribute to the score. Their per-dim levels show up
// in the visual section of the results page on their own.
export function countMetDimensions(
  dimensionLevels: Record<DimensionKey, PerformanceLevel>,
  timingLevel: PerformanceLevel,
): { met: number; total: number } {
  const total = DIMENSIONS.length + 1;
  const met =
    DIMENSIONS.filter((d) => dimensionLevels[d.key] !== "developing").length +
    (timingLevel !== "developing" ? 1 : 0);
  return { met, total };
}

// Verdict sub-label: "Overall · <level> · X of Y dimensions meet"
export function verdictLevel(overallScore100: number): PerformanceLevel {
  if (overallScore100 >= 75) return "exceeds";
  if (overallScore100 >= 55) return "meets";
  return "developing";
}
