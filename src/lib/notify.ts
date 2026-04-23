import { Resend } from "resend";
import { LEVEL_LABELS } from "./rubric";
import { buildPlaintextReport } from "./report";
import type { EvaluationResult } from "./evaluate";

/**
 * Fire off a notification email with the full evaluation report, to the
 * admin email address. Gracefully no-ops if RESEND_API_KEY or ADMIN_EMAIL
 * are not configured — the evaluation response is never blocked by email
 * failure.
 *
 * Uses Resend's sandbox sender (`onboarding@resend.dev`), which works
 * without domain verification as long as the recipient is a verified
 * address on the Resend account.
 */
export async function sendSubmissionEmail(
  result: EvaluationResult,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;

  if (!apiKey || !to) {
    // Feature is opt-in via env vars. Silently skip when not configured.
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const body = buildPlaintextReport(result);
    const subject = `Pitch submission · ${result.overallScore}/100 · ${LEVEL_LABELS[result.verdictLevel]}`;

    await resend.emails.send({
      from: "Elevator Pitch Evaluator <onboarding@resend.dev>",
      to,
      subject,
      text: body,
    });
  } catch (error) {
    // Never let email trouble break the evaluation path.
    console.error("sendSubmissionEmail failed:", error);
  }
}
