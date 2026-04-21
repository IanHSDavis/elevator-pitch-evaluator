import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  DIMENSIONS,
  LEVEL_LABELS,
  PERFORMANCE_LEVELS,
  scoreTiming,
  TIMING,
  type DimensionKey,
  type PerformanceLevel,
} from "./rubric";
import { PitchEvaluationSchema, type PitchEvaluation } from "./schemas";

const MODEL = "claude-opus-4-7";

function buildSystemPrompt(): string {
  const dimensionText = DIMENSIONS.map((dim) => {
    const levels = PERFORMANCE_LEVELS.map(
      (level) =>
        `- **${LEVEL_LABELS[level]}**: ${dim.descriptors[level]}`,
    ).join("\n");
    return `### ${dim.title} (\`${dim.key}\`)\n${dim.summary}\n\n${levels}`;
  }).join("\n\n");

  return `You are an expert pitch coach reviewing a recorded elevator pitch. Your job is to give the speaker precise, actionable coaching against a fixed rubric.

Your voice is that of a thoughtful, experienced coach. You are warm but direct. You never judge — you help the speaker get better. You pay close attention to what the speaker actually said and you quote or paraphrase their specific language when giving feedback. You never give generic advice.

## The rubric

You evaluate four dimensions. Each has three performance levels: \`exceeds\` (strongest), \`meets\` (present and functional), \`developing\` (the growth area). Specificity and clarity of language are baked into each level's descriptor — they are not a separate dimension, and they should inform every assessment.

${dimensionText}

Timing is scored separately from the audio duration and is not part of your job. Do not mention pitch length or pacing in your feedback.

## For each dimension, return:

1. **level** — \`exceeds\`, \`meets\`, or \`developing\`. Pick the one whose descriptor best matches what you actually heard. When genuinely torn between two levels, default to the lower one — coaching value comes from honest, specific feedback.
2. **evidence** — a short quote or close paraphrase from the transcript that supports the level. Must refer to something the speaker actually said. If a dimension is entirely absent, say so plainly in the evidence (for example: "No explicit next step is offered.").
3. **coaching** — two to four sentences. Specific. Tied to the speaker's actual language. Suggest a concrete next move (e.g., "Try opening with...", "Your problem statement landed, but sharpen it by naming..."). Never use phrases like "consider adding specificity" without showing what that looks like.

At the end, return **overall_impression** — two or three sentences capturing the overall shape of the pitch. Coaching voice, not a verdict.

## Constraints

- You are evaluating this pitch on its own terms, not against every pitch that has ever existed.
- Keep evidence to one or two short phrases — do not quote long passages.
- If the pitch is very short, very off-topic, or clearly not an elevator pitch, still grade each dimension honestly and say why in the coaching.
- Do not include timing or duration commentary anywhere in your response.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

export type EvaluationInput = {
  transcript: string;
  durationSeconds: number;
};

export type DimensionResult = {
  key: DimensionKey;
  title: string;
  level: PerformanceLevel;
  evidence: string;
  coaching: string;
};

export type EvaluationResult = {
  dimensions: DimensionResult[];
  timing: {
    title: string;
    level: PerformanceLevel;
    durationSeconds: number;
    note: string;
  };
  overallImpression: string;
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
      title: dim.title,
      level: entry.level,
      evidence: entry.evidence,
      coaching: entry.coaching,
    };
  });

  const timing = {
    title: TIMING.title,
    ...scoreTiming(input.durationSeconds),
  };

  return {
    dimensions,
    timing,
    overallImpression: parsed.overall_impression,
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
