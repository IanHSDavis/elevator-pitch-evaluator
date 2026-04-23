import { LEVEL_LABELS } from "./rubric";
import type { EvaluationResult } from "./evaluate";

/**
 * Build a plain-text report of an evaluation. Used by both the client-side
 * "Copy Report" button and the server-side email notification.
 */
export function buildPlaintextReport(result: EvaluationResult): string {
  const lines: string[] = [];
  lines.push(`ELEVATOR PITCH EVALUATION`);
  lines.push("");
  lines.push(`Verdict: ${result.verdict}`);
  lines.push(
    `Overall: ${result.overallScore}/100 · ${LEVEL_LABELS[result.verdictLevel]} · ${result.verdictMet.met} of ${result.verdictMet.total} dimensions meet`,
  );
  lines.push("");
  lines.push(`OVERALL IMPRESSION`);
  lines.push(result.overallImpression);
  lines.push("");
  lines.push(`TRANSCRIPT`);
  lines.push(result.transcript);
  lines.push("");
  lines.push(
    `TIMING — ${LEVEL_LABELS[result.timing.level]} (${result.timing.badgeLabel})`,
  );
  lines.push(result.timing.note);
  lines.push("");
  for (const dim of result.dimensions) {
    lines.push(
      `${String(dim.index).padStart(2, "0")} · ${dim.title} — ${LEVEL_LABELS[dim.level]} (${dim.subscore}/5, weight ${Math.round(dim.weight * 100)}%)`,
    );
    if (dim.evidence) lines.push(`   Evidence: ${dim.evidence}`);
    lines.push(`   ${dim.coaching}`);
    lines.push("");
  }
  lines.push(
    `Model: ${result.model} · Tokens in/out: ${result.usage.inputTokens}/${result.usage.outputTokens}`,
  );
  return lines.join("\n");
}
