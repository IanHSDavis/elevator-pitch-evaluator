import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_MODEL = "whisper-1";

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "No audio file found in the 'audio' field." },
      { status: 400 },
    );
  }

  if (audio.size === 0) {
    return Response.json(
      { error: "Audio file is empty." },
      { status: 400 },
    );
  }

  if (audio.size > MAX_BYTES) {
    return Response.json(
      { error: `Audio file exceeds ${MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }

  try {
    const client = new OpenAI();
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: WHISPER_MODEL,
    });

    return Response.json({ transcript: transcription.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Whisper transcription failed:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
