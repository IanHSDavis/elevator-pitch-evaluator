import { z } from "zod";
import { PERFORMANCE_LEVELS } from "./rubric";

const DimensionEvaluation = z.object({
  level: z.enum(PERFORMANCE_LEVELS).describe(
    "Performance level for this dimension. Coaching-oriented, not pass/fail.",
  ),
  evidence: z
    .string()
    .describe(
      "A short quote or paraphrase from the transcript that supports this assessment. Must be specific — point to what was actually said.",
    ),
  coaching: z
    .string()
    .describe(
      "Concrete coaching language tied to what the speaker said. Offer a specific next move, not generic advice. Two to four sentences.",
    ),
});

export const PitchEvaluationSchema = z.object({
  opening_and_credibility: DimensionEvaluation,
  customer_problem: DimensionEvaluation,
  value_proposition: DimensionEvaluation,
  call_to_action: DimensionEvaluation,
  overall_impression: z
    .string()
    .describe(
      "A short paragraph — two to three sentences — capturing the overall shape of the pitch. Reads like a coach speaking to the pitcher, not a verdict.",
    ),
});

export type PitchEvaluation = z.infer<typeof PitchEvaluationSchema>;
export type DimensionEvaluation = z.infer<typeof DimensionEvaluation>;
