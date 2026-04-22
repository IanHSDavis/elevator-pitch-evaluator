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

export type DimensionDefinition = {
  key: DimensionKey;
  index: number; // 1..4 — stable numbering used as highlight ref
  title: string;
  shortLabel: string; // 2–3 word strip label, e.g. "Opening & Credibility"
  shortSub: string; // 3–6 word caption, e.g. "Who you are, why listen."
  summary: string; // longer prose for system prompt
  weight: number; // 0..1, sums with TIMING.weight to 1.0
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

// Subscore defaults by level (0–5 scale). Claude returns a precise subscore
// within the level's range for more gradient; these are fallbacks.
export const LEVEL_SUBSCORE_RANGE: Record<PerformanceLevel, { min: number; max: number }> = {
  exceeds: { min: 4, max: 5 },
  meets: { min: 3, max: 4 },
  developing: { min: 1, max: 2 },
};

export function timingSubscore(level: PerformanceLevel): number {
  // Timing is level-only (no Claude subscore) — map deterministically.
  return level === "exceeds" ? 5 : level === "meets" ? 3 : 1;
}

// Overall /100 = Σ (subscore / 5) × weight × 100.
// Claude returns per-dimension subscores 1–5; timing uses timingSubscore().
export function overallScore(args: {
  dimensionSubscores: Record<DimensionKey, number>;
  timingLevel: PerformanceLevel;
}): number {
  let total = 0;
  for (const dim of DIMENSIONS) {
    const sub = args.dimensionSubscores[dim.key];
    total += (sub / 5) * dim.weight;
  }
  total += (timingSubscore(args.timingLevel) / 5) * TIMING.weight;
  return Math.round(total * 100);
}

// Count how many dimensions landed at "meets" or "exceeds".
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
