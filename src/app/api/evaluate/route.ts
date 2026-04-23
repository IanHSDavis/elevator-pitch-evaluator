import { z } from "zod";
import { evaluatePitch } from "@/lib/evaluate";
import { sendSubmissionEmail } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z.object({
  transcript: z.string().min(1, "transcript is required"),
  durationSeconds: z.number().positive("durationSeconds must be > 0"),
});

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await evaluatePitch(parsed.data);
    // Fire-and-forget: email the admin. The helper swallows errors so an
    // email failure never breaks the user's evaluation response.
    await sendSubmissionEmail(result);
    // TEMP diagnostic: expose env-var presence flags so we can verify from the
    // client whether the deployed function sees the notify env vars.
    const debug = {
      resendKeyPresent: Boolean(process.env.RESEND_API_KEY),
      resendKeyLength: process.env.RESEND_API_KEY?.length ?? 0,
      adminEmailPresent: Boolean(process.env.ADMIN_EMAIL),
      adminEmailDomain: process.env.ADMIN_EMAIL?.split("@")[1] ?? null,
    };
    return Response.json({ ...result, __debug: debug });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("evaluatePitch failed:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
