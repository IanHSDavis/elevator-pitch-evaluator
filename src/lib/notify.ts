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
export type NotifyOutcome =
  | { status: "skipped"; reason: string }
  | { status: "sent"; id?: string }
  | { status: "error"; message: string };

export async function sendSubmissionEmail(
  result: EvaluationResult,
): Promise<NotifyOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;

  if (!apiKey || !to) {
    return {
      status: "skipped",
      reason: !apiKey ? "no RESEND_API_KEY" : "no ADMIN_EMAIL",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const body = buildPlaintextReport(result);
    const subject = `Pitch submission · ${result.overallScore}/100 · ${LEVEL_LABELS[result.verdictLevel]}`;

    const response = await resend.emails.send({
      from: "Elevator Pitch Evaluator <onboarding@resend.dev>",
      to,
      subject,
      text: body,
    });

    if (response.error) {
      return {
        status: "error",
        message: `${response.error.name ?? ""}: ${response.error.message ?? JSON.stringify(response.error)}`,
      };
    }
    return { status: "sent", id: response.data?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("sendSubmissionEmail failed:", error);
    return { status: "error", message: msg };
  }
}
