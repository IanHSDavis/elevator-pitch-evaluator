export const PERFORMANCE_LEVELS = ["exceeds", "meets", "developing"] as const;
export type PerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];

export const LEVEL_LABELS: Record<PerformanceLevel, string> = {
  exceeds: "Exceeds",
  meets: "Meets",
  developing: "Developing",
};

export type DimensionKey =
  | "opening_and_credibility"
  | "customer_problem"
  | "value_proposition"
  | "call_to_action";

export type DimensionDefinition = {
  key: DimensionKey;
  title: string;
  summary: string;
  descriptors: Record<PerformanceLevel, string>;
};

export const DIMENSIONS: DimensionDefinition[] = [
  {
    key: "opening_and_credibility",
    title: "Opening & Credibility Frame",
    summary:
      "Establishes who the speaker is and what they offer, ideally within the first 15 seconds.",
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
    title: "Customer Problem Identification",
    summary:
      "Names a specific, recognizable pain point or business need the listener can place themselves in.",
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
    title: "Value Proposition",
    summary:
      "Connects the solution to the stated problem — what the listener gets and why it matters.",
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
    title: "Call to Action",
    summary:
      "Closes with a clear, natural next step that advances the conversation.",
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
  title: "Timing",
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

export function scoreTiming(durationSeconds: number): {
  level: PerformanceLevel;
  durationSeconds: number;
  note: string;
} {
  const { targetMinSeconds, targetMaxSeconds, grayZoneSeconds } = TIMING;

  if (
    durationSeconds >= targetMinSeconds &&
    durationSeconds <= targetMaxSeconds
  ) {
    return {
      level: "exceeds",
      durationSeconds,
      note: `${durationSeconds.toFixed(0)}s — inside the target 45–90s window.`,
    };
  }

  const lowerEdge = targetMinSeconds - grayZoneSeconds;
  const upperEdge = targetMaxSeconds + grayZoneSeconds;
  if (durationSeconds >= lowerEdge && durationSeconds <= upperEdge) {
    const direction =
      durationSeconds < targetMinSeconds ? "short of" : "over";
    return {
      level: "meets",
      durationSeconds,
      note: `${durationSeconds.toFixed(0)}s — within 15s of the target, ${direction} the window.`,
    };
  }

  const direction = durationSeconds < targetMinSeconds ? "too brief" : "too long";
  return {
    level: "developing",
    durationSeconds,
    note: `${durationSeconds.toFixed(0)}s — ${direction} to land a full pitch.`,
  };
}
