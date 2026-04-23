import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  countMetDimensions,
  DIMENSIONS,
  LEVEL_LABELS,
  overallScore,
  PERFORMANCE_LEVELS,
  scoreTiming,
  subscoreForLevel,
  TIMING,
  verdictLevel,
  type DimensionKey,
  type PerformanceLevel,
  type TimingResult,
} from "./rubric";
import { PitchEvaluationSchema, type PitchEvaluation } from "./schemas";

const MODEL = "claude-opus-4-7";

function buildSystemPrompt(): string {
  const dimensionText = DIMENSIONS.map((dim) => {
    const levels = PERFORMANCE_LEVELS.map(
      (level) => `- **${LEVEL_LABELS[level]}**: ${dim.descriptors[level]}`,
    ).join("\n");
    return `### ${dim.title} (\`${dim.key}\`)\n${dim.summary}\n\n${levels}`;
  }).join("\n\n");

  return `You are an expert pitch coach reviewing a recorded elevator pitch. Your job is to give the speaker precise, actionable coaching against a fixed rubric — in an editorial, no-cheerleading voice.

You are warm but direct. You pay close attention to what the speaker actually said and you quote or paraphrase their specific language when giving feedback. You never give generic advice. Your tone is that of a thoughtful, experienced coach writing a single-page readout.

## The rubric

You evaluate four dimensions. Each has three performance levels: \`exceeds\` (strongest), \`meets\` (present and functional), \`developing\` (the growth area). Specificity and clarity are baked into each level's descriptor.

${dimensionText}

Timing is scored separately from the actual audio duration and is not part of your job. Do not mention pitch length, pacing, or audio duration in your feedback.

## Calibration — how to pick a level consistently

For every dimension, start by asking whether the pitch clearly does what the \`meets\` descriptor says. If it doesn't, the level is \`developing\`. If it clearly does, then ask whether it also clears the \`exceeds\` bar. The following boundary rules anchor the meets/exceeds judgment for the two dimensions where the distinction is most slippery. Apply them literally.

### Opening & Credibility Frame — meets vs exceeds

A pitch that states name, role, and company clearly but in generic language is **meets**. Example of meets-tier: "I'm Jordan, and I run a SaaS company called TrackTide." Identity is clear; nothing about the framing would stick in a listener's memory 60 seconds later.

For **exceeds**, the opening must include a *specific, memorable descriptor* that does one of these three things:
- Defines the category in distinctive terms (e.g., "the churn-intelligence layer for B2B SaaS," "a compliance wedge for mid-market fintechs").
- Names a role definition that creates a mental picture (e.g., "I coach revenue leaders on their first 90 days").
- Opens with a sharp framing device — a provocation, a statistic, a contrast — that earns the next sentence.

Default to **meets** unless the memorable-descriptor test is clearly satisfied. A "small SaaS company" generic framing, no matter how clearly stated, is meets.

### Customer Problem Identification — meets vs exceeds

A pitch that names a problem in abstract or general terms is **meets**. Examples of meets-tier: "Most companies struggle to understand their customer churn." / "Teams can't figure out why users leave." The problem is present and recognizable, but stated at a level of abstraction that any buyer could nod along to without feeling personally addressed.

For **exceeds**, the problem must be anchored to at least one of:
- A specific role or persona (e.g., "Customer Success leaders," "VPs of Product").
- A concrete moment or scene (e.g., "staring at a Monday morning dashboard," "mid-QBR when the CEO asks why").
- A quantifiable frustration (e.g., "spending eight hours a week reconciling spreadsheets").

Default to **meets** unless a reader whose job literally involves that pain would think "that's me." Vague empathy is meets; named empathy is exceeds.

### Value Proposition and Call to Action

These boundaries tend to be less ambiguous — apply the descriptors directly. For Value Proposition, the solution must be tied to the problem (a generic product blurb that doesn't reference the stated problem is developing, not meets). For Call to Action, the test is whether the listener has a concrete, low-friction next move; "learn more" or restating the product is not a call to action.

## What to return per dimension

1. **level** — \`exceeds\`, \`meets\`, or \`developing\`. Apply the calibration rules above; when torn, default to the lower level. You do **not** return a numeric subscore — the client derives it from the level.
2. **evidence** — a short quote or close paraphrase that supports the level. Must refer to something actually said. If a dimension is entirely absent, say so plainly (e.g., "No explicit next step is offered.").
3. **highlight** — the exact phrase from the transcript to highlight in-line. Copy it verbatim — the client matches it against the transcript and wraps it with a <mark> tag to create a clickable cross-reference to your coaching. Pick the single most emblematic phrase for this dimension. If there's no good single phrase (e.g., the dimension is completely absent), return an empty string.
4. **coaching** — two to four sentences. Specific. Tied to the speaker's actual language. Suggest a concrete next move. Never use phrases like "consider adding specificity" without showing what that looks like.

## And overall

- **verdict** — one-sentence editorial headline capturing the shape of the pitch. Under ~14 words. Rendered in big serif on the results page. Should feel like a line a thoughtful coach would write. Examples of the vibe: "A pitch needs a problem, a product, and a next step." / "Close on the ask — everything before it lands." / "The story works; tighten the opening."
- **overall_impression** — two to four sentences. Coaching voice, not a verdict. What is the shape of this pitch, and where is the single biggest lever for improvement?

## Constraints

- Evaluate this pitch on its own terms.
- Keep evidence to one or two short phrases — do not quote long passages.
- If the pitch is very short, off-topic, or clearly not an elevator pitch, still grade each dimension honestly and explain your read in the coaching.
- Do not include timing or duration commentary anywhere in your response.
- The \`highlight\` string must appear verbatim in the transcript (case- and punctuation-insensitive matching is applied, but closer matches highlight better). If you can't find a clean single phrase, return an empty string rather than inventing one.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

export type EvaluationInput = {
  transcript: string;
  durationSeconds: number;
};

export type DimensionResult = {
  key: DimensionKey;
  index: number;
  title: string;
  shortLabel: string;
  level: PerformanceLevel;
  subscore: number;
  weight: number;
  evidence: string;
  highlight: string; // may be empty
  coaching: string;
};

export type EvaluationResult = {
  verdict: string;
  verdictLevel: PerformanceLevel;
  verdictMet: { met: number; total: number };
  overallImpression: string;
  overallScore: number; // 0..100
  transcript: string;
  dimensions: DimensionResult[];
  timing: TimingResult & { weight: number; subscore: number; title: string };
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number | null;
    cacheCreationInputTokens: number | null;
  };
};

export async function evaluatePitch(
  input: EvaluationInput,
): Promise<EvaluationResult> {
  const client = new Anthropic();

  const userMessage = `Here is the pitch transcript to evaluate. Coach the speaker against the rubric.

<transcript>
${input.transcript.trim()}
</transcript>`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(PitchEvaluationSchema),
    },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const parsed: PitchEvaluation | null = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `Claude returned an unparseable response (stop_reason: ${response.stop_reason}).`,
    );
  }

  const dimensions: DimensionResult[] = DIMENSIONS.map((dim) => {
    const entry = parsed[dim.key];
    return {
      key: dim.key,
      index: dim.index,
      title: dim.title,
      shortLabel: dim.shortLabel,
      level: entry.level,
      subscore: subscoreForLevel(entry.level),
      weight: dim.weight,
      evidence: entry.evidence,
      highlight: entry.highlight,
      coaching: entry.coaching,
    };
  });

  const timingBase = scoreTiming(input.durationSeconds);
  const timing = {
    ...timingBase,
    title: TIMING.title,
    weight: TIMING.weight,
    subscore: subscoreForLevel(timingBase.level),
  };

  const dimensionLevels = Object.fromEntries(
    dimensions.map((d) => [d.key, d.level]),
  ) as Record<DimensionKey, PerformanceLevel>;

  const overall = overallScore({
    dimensionLevels,
    timingLevel: timing.level,
  });

  const metCounts = countMetDimensions(dimensionLevels, timing.level);

  return {
    verdict: parsed.verdict,
    verdictLevel: verdictLevel(overall),
    verdictMet: metCounts,
    overallImpression: parsed.overall_impression,
    overallScore: overall,
    transcript: input.transcript.trim(),
    dimensions,
    timing,
    model: MODEL,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
      cacheCreationInputTokens:
        response.usage.cache_creation_input_tokens ?? null,
    },
  };
}
