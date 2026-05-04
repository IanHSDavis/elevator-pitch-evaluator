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

// Visual dims have a different evidence/highlight contract: nothing to quote
// from a transcript, so `evidence` describes what's *visible in the frames*
// and `highlight` is omitted (no transcript phrase to anchor to). Coaching
// stays in the same voice.
const VisualDimensionEvaluation = z.object({
  level: z.enum(PERFORMANCE_LEVELS).describe(
    "Performance level for this visual dimension, picked by examining the 4 keyframes.",
  ),
  evidence: z
    .string()
    .describe(
      "What's actually visible in the keyframes that supports the chosen level. One to two short observations. Must refer to things you can literally see in the frames (e.g., 'eyes aimed below the camera in 3 of 4 frames', 'open posture across all four frames'). Do not speculate about audio or pacing.",
    ),
  coaching: z
    .string()
    .describe(
      "Two to three sentences of concrete coaching tied to the specific visual tells you observed. Suggest a concrete next move (camera height, lighting position, where to look during practice, hand placement). Never generic advice.",
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

// Same as the audio-only schema plus three visual dimensions. Used when video
// keyframes are part of the input — Claude is shown the frames and is
// expected to score visual presence/eye contact/delivery confidence in
// addition to the four audio-coachable dims.
export const PitchEvaluationVideoSchema = PitchEvaluationSchema.extend({
  presence: VisualDimensionEvaluation,
  eye_contact: VisualDimensionEvaluation,
  delivery_confidence: VisualDimensionEvaluation,
});

export type PitchEvaluation = z.infer<typeof PitchEvaluationSchema>;
export type PitchEvaluationVideo = z.infer<typeof PitchEvaluationVideoSchema>;
export type DimensionEvaluation = z.infer<typeof DimensionEvaluation>;
export type VisualDimensionEvaluation = z.infer<
  typeof VisualDimensionEvaluation
>;
