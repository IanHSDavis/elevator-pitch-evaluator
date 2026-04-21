"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EvaluationResult } from "@/lib/evaluate";
import { LEVEL_LABELS, type PerformanceLevel } from "@/lib/rubric";

type Status =
  | "idle"
  | "recording"
  | "recorded"
  | "transcribing"
  | "evaluating"
  | "done"
  | "error";

const LEVEL_STYLES: Record<PerformanceLevel, string> = {
  exceeds:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  meets: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  developing:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

function LevelBadge({ level }: { level: PerformanceLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${LEVEL_STYLES[level]}`}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

function pickMimeType(): string {
  if (typeof window === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paste-instead fallback mode
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [pastedDuration, setPastedDuration] = useState("60");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function resetAll() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setStatus("idle");
    setElapsedSeconds(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript(null);
    setResult(null);
    setError(null);
  }

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    setTranscript(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStatus("recorded");
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setStatus("recording");
      tickerRef.current = setInterval(() => {
        setElapsedSeconds((Date.now() - startedAtRef.current) / 1000);
      }, 100);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Microphone access failed: ${err.message}`
          : "Microphone access failed.",
      );
      setStatus("error");
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setElapsedSeconds((Date.now() - startedAtRef.current) / 1000);
  }, []);

  async function evaluateRecording() {
    if (!audioBlob) return;
    setError(null);
    setResult(null);
    setStatus("transcribing");

    try {
      const ext = audioBlob.type.includes("mp4")
        ? "mp4"
        : audioBlob.type.includes("ogg")
          ? "ogg"
          : "webm";
      const formData = new FormData();
      formData.append("audio", audioBlob, `pitch.${ext}`);

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) {
        throw new Error(transcribeData.error ?? "Transcription failed.");
      }
      setTranscript(transcribeData.transcript);

      setStatus("evaluating");
      const evaluateRes = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcribeData.transcript,
          durationSeconds: elapsedSeconds,
        }),
      });
      const evaluateData = await evaluateRes.json();
      if (!evaluateRes.ok) {
        throw new Error(evaluateData.error ?? "Evaluation failed.");
      }
      setResult(evaluateData as EvaluationResult);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function evaluatePasted(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setStatus("evaluating");
    setTranscript(pastedTranscript);

    try {
      const evaluateRes = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: pastedTranscript,
          durationSeconds: Number(pastedDuration),
        }),
      });
      const evaluateData = await evaluateRes.json();
      if (!evaluateRes.ok) {
        throw new Error(evaluateData.error ?? "Evaluation failed.");
      }
      setResult(evaluateData as EvaluationResult);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const busy =
    status === "recording" ||
    status === "transcribing" ||
    status === "evaluating";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Elevator Pitch Evaluator
          </h1>
          <p className="text-lg leading-7 text-zinc-600 dark:text-zinc-400">
            Record a 60–90 second elevator pitch. Whisper transcribes it,
            Claude coaches it against a five-dimension rubric.
          </p>
        </header>

        {pasteMode ? (
          <PasteModeCard
            transcript={pastedTranscript}
            setTranscript={setPastedTranscript}
            duration={pastedDuration}
            setDuration={setPastedDuration}
            onSubmit={evaluatePasted}
            onBack={() => {
              setPasteMode(false);
              resetAll();
            }}
            busy={busy}
          />
        ) : (
          <RecorderCard
            status={status}
            elapsedSeconds={elapsedSeconds}
            audioUrl={audioUrl}
            onStart={startRecording}
            onStop={stopRecording}
            onReRecord={() => {
              resetAll();
            }}
            onEvaluate={evaluateRecording}
            onSwitchToPaste={() => {
              resetAll();
              setPasteMode(true);
            }}
          />
        )}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {transcript ? <TranscriptView transcript={transcript} /> : null}

        {result ? <ResultsView result={result} /> : null}
      </main>
    </div>
  );
}

function RecorderCard({
  status,
  elapsedSeconds,
  audioUrl,
  onStart,
  onStop,
  onReRecord,
  onEvaluate,
  onSwitchToPaste,
}: {
  status: Status;
  elapsedSeconds: number;
  audioUrl: string | null;
  onStart: () => void;
  onStop: () => void;
  onReRecord: () => void;
  onEvaluate: () => void;
  onSwitchToPaste: () => void;
}) {
  const isRecording = status === "recording";
  const isRecorded = status === "recorded";
  const isProcessing = status === "transcribing" || status === "evaluating";

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {status === "idle" && "Ready to record"}
          {isRecording && "Recording…"}
          {isRecorded && "Recording complete"}
          {status === "transcribing" && "Transcribing audio…"}
          {status === "evaluating" && "Evaluating pitch…"}
          {status === "done" && "Evaluation complete"}
          {status === "error" && "Error — try again"}
        </span>
        <span className="font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      {isRecording ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3 dark:bg-red-950/40">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <span className="text-sm text-red-800 dark:text-red-200">
            Recording in progress — aim for 45–90 seconds.
          </span>
        </div>
      ) : null}

      {isRecorded && audioUrl ? (
        <audio
          controls
          src={audioUrl}
          className="w-full"
          preload="metadata"
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        {status === "idle" || status === "error" ? (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-white" />
            Start recording
          </button>
        ) : null}

        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Stop
          </button>
        ) : null}

        {isRecorded ? (
          <>
            <button
              type="button"
              onClick={onEvaluate}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Evaluate this pitch
            </button>
            <button
              type="button"
              onClick={onReRecord}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-transparent px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Re-record
            </button>
          </>
        ) : null}

        {isProcessing ? (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-zinc-400 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-700"
          >
            {status === "transcribing" ? "Transcribing…" : "Evaluating…"}
          </button>
        ) : null}
      </div>

      {status === "idle" ? (
        <button
          type="button"
          onClick={onSwitchToPaste}
          className="self-start text-sm text-zinc-500 underline-offset-2 hover:underline"
        >
          Paste a transcript instead
        </button>
      ) : null}
    </div>
  );
}

function PasteModeCard({
  transcript,
  setTranscript,
  duration,
  setDuration,
  onSubmit,
  onBack,
  busy,
}: {
  transcript: string;
  setTranscript: (value: string) => void;
  duration: string;
  setDuration: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Pitch transcript
        </span>
        <textarea
          required
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={10}
          placeholder="Paste what the speaker said."
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-black placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Pitch duration (seconds)
        </span>
        <input
          required
          type="number"
          min={1}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-32 rounded-lg border border-zinc-300 bg-white p-2 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || transcript.trim().length === 0}
          className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {busy ? "Evaluating…" : "Evaluate pitch"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Back to recording
        </button>
      </div>
    </form>
  );
}

function TranscriptView({ transcript }: { transcript: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Transcript
      </h2>
      <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-zinc-700 dark:text-zinc-300">
        {transcript}
      </p>
    </section>
  );
}

function ResultsView({ result }: { result: EvaluationResult }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Overall impression
        </h2>
        <p className="mt-3 text-base leading-7 text-zinc-700 dark:text-zinc-300">
          {result.overallImpression}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
              {result.timing.title}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {result.timing.note}
            </p>
          </div>
          <LevelBadge level={result.timing.level} />
        </div>
      </div>

      {result.dimensions.map((dim) => (
        <div
          key={dim.key}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
              {dim.title}
            </h3>
            <LevelBadge level={dim.level} />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Evidence
              </p>
              <p className="mt-1 text-sm italic text-zinc-600 dark:text-zinc-400">
                {dim.evidence}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Coaching
              </p>
              <p className="mt-1 text-base leading-7 text-zinc-800 dark:text-zinc-200">
                {dim.coaching}
              </p>
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-zinc-500 dark:text-zinc-600">
        Model: {result.model} · Tokens in/out: {result.usage.inputTokens}/
        {result.usage.outputTokens}
        {result.usage.cacheReadInputTokens !== null &&
        result.usage.cacheReadInputTokens > 0
          ? ` · Cache hit: ${result.usage.cacheReadInputTokens} tokens`
          : ""}
      </p>
    </section>
  );
}
