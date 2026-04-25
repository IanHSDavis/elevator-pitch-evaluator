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

/**
 * Thrown when evaluatePitch fails in a way the user-facing route should
 * surface with a specific HTTP status and a friendly message. Catches
 * upstream overload (529) and credit/auth issues — both of which were
 * leaking raw provider errors to users in prod (see LEARNINGS).
 */
export class EvaluatePitchError extends Error {
  constructor(
    message: string,
    readonly statusHint: number = 500,
  ) {
    super(message);
    this.name = "EvaluatePitchError";
  }
}

const FRIENDLY_OVERLOADED =
  "The evaluation model is temporarily overloaded. Please try again in a moment.";
const FRIENDLY_UNAVAILABLE =
  "The evaluation service is temporarily unavailable. Please try again later.";

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

### Value Proposition — meets vs developing

If the solution describes **what the product does** (a feature or capability) without naming an outcome the customer would recognize as valuable, that's **developing**. Example of developing-tier framings: "our platform unifies your data," "we give you a clearer view of your backlog," "our UI is beautiful and easy to use." Each is a feature statement — the listener still has to do the work of inferring what changes for them.

For **meets**, the solution must imply an outcome a buyer would recognize — even if the mechanism is vague and the number is fuzzy. Example of meets-tier framings: "we help CS teams reduce churn," "we cut audit prep from weeks to days," "we give PMs confidence they're building the right things." The mechanism can be soft; the outcome has to be legible.

Default to **developing** when the solution is a feature description with no outcome named, even if it's technically connected to the stated problem. Tautological framings like "we help you prioritize better" in response to a "trouble prioritizing" problem are developing — the problem is just restated as the solution.

### Call to Action — meets vs developing

For **meets**, the pitch must end with an invitation that names *some* specific next step — even an imprecise one. Examples of meets-tier closes: "happy to send over a one-pager," "let's grab a few minutes when you're free," "check out our demo site." These aren't sharp (that would be exceeds) but they point at a concrete action the listener can take.

**Developing** covers two cases: (a) the pitch trails off with no invitation at all, and (b) the pitch ends with an invitation so vague that it puts all the conversational work on the listener. Example developing-tier closes: "check it out," "let me know if you're interested," "chat more about this sometime if you're interested." These are *words that look like* a CTA without actually being one — the listener still has to generate the question, propose the meeting, or figure out what "it" is and whether they're "interested" enough to pursue it.

Default to **developing** when the closing words require the listener to do the conversational work.

## What to return per dimension

1. **level** — \`exceeds\`, \`meets\`, or \`developing\`. Apply the calibration rules above; when torn, default to the lower level. You do **not** return a numeric subscore — the client derives it from the level.
2. **evidence** — a short quote or close paraphrase that supports the level. Must refer to something actually said. If a dimension is entirely absent, say so plainly (e.g., "No explicit next step is offered.").
3. **highlight** — the exact phrase from the transcript to highlight in-line. Copy it verbatim — the client matches it against the transcript and wraps it with a <mark> tag to create a clickable cross-reference to your coaching. Pick the single most emblematic phrase for this dimension. If there's no good single phrase (e.g., the dimension is completely absent), return an empty string.
4. **coaching** — two to four sentences. Specific. Tied to the speaker's actual language. Suggest a concrete next move. Never use phrases like "consider adding specificity" without showing what that looks like.

## And overall

- **verdict** — one-sentence editorial headline capturing the shape of the pitch. Under ~14 words. Rendered in big serif on the results page. Should feel like a line a thoughtful coach would write. Examples of the vibe: "A pitch needs a problem, a product, and a next step." / "Close on the ask — everything before it lands." / "The story works; tighten the opening."
- **overall_impression** — two to four sentences. Coaching voice, not a verdict. What is the shape of this pitch, and where is the single biggest lever for improvement? When the highest-leverage move is **posture-level** — the rep is apologizing for taking time ("I think you'd like it"), founder-showing-off (leading with category labels a buyer wouldn't use), hedging the ask, or pitching at the buyer instead of qualifying with them — name that explicitly and lead with it. Word-level edits applied to a broken posture leave the rep changing surface phrases while keeping the underlying stance intact. If posture reads clearly, lead with it; if it doesn't, stay in the structural read — do not manufacture a posture call. **When the rubric is fully satisfied, look one layer deeper.** A pitch that earns \`exceeds\` on every dimension still leaves a senior coach with things to say. The rubric grades structure; it doesn't catch tactical issues like founder-voice vocabulary the buyer wouldn't use ("the X wedge," "the Y layer"), proof points that telegraph early-stage to a risk-averse buyer ("first twelve customers"), lines that sound surveilling rather than researched ("I know your team just closed a B round" — name the source or cut it), or pitching where discovery is needed (no qualifying question before the ask). When the rubric pass is clean, surface one of these. If you can't find one honestly, say the pitch is genuinely strong and stop — do not pad with celebration.

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
  // maxRetries: 4 (SDK default is 2). Bumps the budget for transient
  // upstream errors — primarily 529 overload during peak load on Opus.
  // The SDK applies exponential backoff between retries.
  const client = new Anthropic({ maxRetries: 4 });

  const userMessage = `Here is the pitch transcript to evaluate. Coach the speaker against the rubric.

<transcript>
${input.transcript.trim()}
</transcript>`;

  let response;
  try {
    response = await client.messages.parse({
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
  } catch (err: unknown) {
    // Surface raw error to server logs; user-facing message is rewritten
    // below to avoid leaking provider internals into the UI.
    console.error("Anthropic call failed in evaluatePitch:", err);

    const status = (err as { status?: number })?.status;
    const rawMessage = err instanceof Error ? err.message : String(err);

    if (status === 529 || /overloaded/i.test(rawMessage)) {
      throw new EvaluatePitchError(FRIENDLY_OVERLOADED, 503);
    }
    if (
      status === 401 ||
      /credit balance is too low|insufficient_quota|invalid_api_key/i.test(
        rawMessage,
      )
    ) {
      throw new EvaluatePitchError(FRIENDLY_UNAVAILABLE, 503);
    }
    throw err;
  }

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
