import { z } from "zod";
import { PERFORMANCE_LEVELS } from "./rubric";

const DimensionEvaluation = z.object({
  level: z.enum(PERFORMANCE_LEVELS).describe(
    "Performance level for this dimension. Coaching-oriented, not pass/fail. The numeric subscore is derived from this level deterministically in code — you do not return it.",
  ),
  evidence: z
    .string()
    .describe(
      "A short quote or close paraphrase from the transcript supporting this level. One to two short phrases. Must come from something the speaker actually said; if a dimension is entirely absent, say so plainly (e.g., 'No explicit next step is offered.').",
    ),
  highlight: z
    .string()
    .describe(
      "The exact phrase from the transcript to highlight in-line. Copy verbatim — it will be matched and wrapped with a <mark> tag. If there's no good single phrase to highlight (e.g., the dimension is entirely absent), return an empty string.",
    ),
  coaching: z
    .string()
    .describe(
      "Two to four sentences of concrete coaching. Specific, tied to the speaker's actual language, suggesting a concrete next move. Never generic advice.",
    ),
});

export const PitchEvaluationSchema = z.object({
  verdict: z
    .string()
    .describe(
      "One-sentence editorial headline capturing the shape of the pitch. Under ~14 words. Will be displayed in large serif. Example: 'A pitch needs a problem, a product, and a next step.'",
    ),
  overall_impression: z
    .string()
    .describe(
      "A paragraph, two to four sentences, capturing the overall shape of the pitch. Coaching voice, not a verdict.",
    ),
  opening_and_credibility: DimensionEvaluation,
  customer_problem: DimensionEvaluation,
  value_proposition: DimensionEvaluation,
  call_to_action: DimensionEvaluation,
});

export type PitchEvaluation = z.infer<typeof PitchEvaluationSchema>;
export type DimensionEvaluation = z.infer<typeof DimensionEvaluation>;
