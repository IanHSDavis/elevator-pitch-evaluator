"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvaluationResult } from "@/lib/evaluate";
import {
  DIMENSIONS,
  LEVEL_LABELS,
  LEVEL_PALETTE,
  PERFORMANCE_LEVELS,
  TIMING,
  type PerformanceLevel,
} from "@/lib/rubric";
import {
  buildTranscriptSegments,
  toSuperscript,
} from "@/lib/highlights";
import { DEMO_PITCH } from "@/lib/demoPitch";
import {
  clearHistory,
  loadHistory,
  saveToHistory,
  type HistoryEntry,
} from "@/lib/history";

type Screen =
  | "landing"
  | "recording"
  | "processing"
  | "results"
  | "history"
  | "error";
type ProcessingStep = 0 | 1 | 2 | 3 | 4; // 4 = all done

// Max recording length. Whisper caps uploads at 25 MB — at typical WebM/Opus
// bitrates, ~3 minutes is the safe ceiling.
const RECORDING_HARD_CUTOFF_SECONDS = 180;
// Floor below which the pitch is too short to coach on meaningfully.
const MIN_PITCH_SECONDS = 8;
// Minimum transcript length (chars) we'll even try to evaluate.
const MIN_TRANSCRIPT_CHARS = 30;

type ErrorKind =
  | "mic_denied"
  | "mic_missing"
  | "mic_generic"
  | "too_short"
  | "empty_transcript"
  | "upload_too_large"
  | "api_failure";

type ErrorState = {
  kind: ErrorKind;
  title: string;
  message: string;
  canRetry: boolean;
  hint?: string;
};

type RetryContext = {
  audioBlob: Blob;
  durationSeconds: number;
  audioUrl: string;
} | null;

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(0);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [landingError, setLandingError] = useState<ErrorState | null>(null);
  const retryRef = useRef<RetryContext>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const procFakeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      procFakeTimersRef.current.forEach(clearTimeout);
    };
  }, [audioUrl]);

  function resetAll() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsedSeconds(0);
    setResult(null);
    setErrorState(null);
    setLandingError(null);
    setProcessingStep(0);
    retryRef.current = null;
    procFakeTimersRef.current.forEach(clearTimeout);
    procFakeTimersRef.current = [];
  }

  const startRecording = useCallback(async () => {
    resetAll();
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
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setScreen("recording");
      tickerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setElapsedSeconds(elapsed);
        // Hard cutoff at 3 minutes — Whisper's 25MB upload cap.
        if (elapsed >= RECORDING_HARD_CUTOFF_SECONDS) {
          onStopAndEvaluate();
        }
      }, 80);
    } catch (err) {
      setLandingError(classifyMicError(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    const finalElapsed = (Date.now() - startedAtRef.current) / 1000;
    setElapsedSeconds(finalElapsed);
  }, []);

  const cancelRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    resetAll();
    setScreen("landing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runFullPipeline(args: {
    audioBlobForTranscribe: Blob | null;
    presetTranscript: string | null;
    durationSeconds: number;
  }) {
    setErrorState(null);
    setResult(null);
    setProcessingStep(0);
    procFakeTimersRef.current.forEach(clearTimeout);
    procFakeTimersRef.current = [];
    setScreen("processing");

    try {
      let transcript: string;

      if (args.presetTranscript != null) {
        transcript = args.presetTranscript;
        // Fake the transcribe step for UX continuity.
        await sleep(900);
        setProcessingStep(1);
      } else if (args.audioBlobForTranscribe) {
        const fd = new FormData();
        const ext = pickExt(args.audioBlobForTranscribe.type);
        fd.append(
          "audio",
          args.audioBlobForTranscribe,
          `pitch.${ext}`,
        );
        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: fd,
        });
        const transcribeData = await transcribeRes.json();
        if (!transcribeRes.ok) {
          if (transcribeRes.status === 413) {
            throw errorObject({
              kind: "upload_too_large",
              title: "Recording too long",
              message:
                "Your recording is over the 25 MB upload limit. Try a shorter take — the target window is 60–90 seconds anyway.",
              canRetry: false,
            });
          }
          throw errorObject({
            kind: "api_failure",
            title: "Transcription failed",
            message:
              transcribeData.error ??
              "Whisper didn't return a transcript for this recording.",
            canRetry: true,
          });
        }
        transcript = transcribeData.transcript;
        setProcessingStep(1);
      } else {
        throw errorObject({
          kind: "api_failure",
          title: "No audio provided",
          message: "Nothing was sent to transcribe. Try recording again.",
          canRetry: false,
        });
      }

      // Guard against empty / silence-only transcripts before hitting Claude.
      const trimmed = (transcript ?? "").trim();
      if (trimmed.length < MIN_TRANSCRIPT_CHARS) {
        throw errorObject({
          kind: "empty_transcript",
          title: "We couldn't make out a pitch",
          message:
            trimmed.length === 0
              ? "Whisper didn't hear anything in that recording. Make sure your mic is close and try again."
              : `Whisper transcribed only "${trimmed}" — not enough to coach on. Try again with a fuller take.`,
          canRetry: args.presetTranscript == null,
        });
      }

      // Fire off evaluate; during its wait, step UI advances on fake timers.
      procFakeTimersRef.current.push(
        setTimeout(() => setProcessingStep(2), 600),
        setTimeout(() => setProcessingStep(3), 2400),
      );

      const evaluateRes = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          durationSeconds: args.durationSeconds,
        }),
      });
      const evaluateData = await evaluateRes.json();
      if (!evaluateRes.ok) {
        throw errorObject({
          kind: "api_failure",
          title: "Evaluation failed",
          message:
            evaluateData.error ??
            "Claude didn't return an evaluation for this pitch.",
          canRetry: true,
        });
      }

      procFakeTimersRef.current.forEach(clearTimeout);
      procFakeTimersRef.current = [];
      setProcessingStep(4);
      await sleep(350);

      const resolved = evaluateData as EvaluationResult;
      setResult(resolved);
      saveToHistory(resolved);
      setScreen("results");
    } catch (err) {
      procFakeTimersRef.current.forEach(clearTimeout);
      procFakeTimersRef.current = [];
      setErrorState(toErrorState(err));
      setScreen("error");
    }
  }

  function onStopAndEvaluate() {
    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    stopRecording();
    // Wait one tick so onstop fires and audioBlob is ready.
    setTimeout(() => {
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, {
            type: recorderRef.current?.mimeType || "audio/webm",
          })
        : audioBlob;
      if (!blob) {
        setLandingError({
          kind: "too_short",
          title: "No audio captured",
          message:
            "The recording didn't pick up any audio. Check your microphone is active and try again.",
          canRetry: false,
        });
        setScreen("landing");
        return;
      }
      if (elapsed < MIN_PITCH_SECONDS) {
        setLandingError({
          kind: "too_short",
          title: "That was too short",
          message: `The recording came in at ${elapsed.toFixed(1)}s. Give yourself at least ${MIN_PITCH_SECONDS} seconds to land a pitch — ideally 60–90.`,
          canRetry: false,
        });
        setScreen("landing");
        return;
      }
      // Remember what we captured so the error-screen retry can reuse it.
      const url = URL.createObjectURL(blob);
      retryRef.current = {
        audioBlob: blob,
        audioUrl: url,
        durationSeconds: elapsed,
      };
      runFullPipeline({
        audioBlobForTranscribe: blob,
        presetTranscript: null,
        durationSeconds: elapsed,
      });
    }, 100);
  }

  function retryLastRun() {
    const ctx = retryRef.current;
    if (!ctx) {
      resetAll();
      setScreen("landing");
      return;
    }
    runFullPipeline({
      audioBlobForTranscribe: ctx.audioBlob,
      presetTranscript: null,
      durationSeconds: ctx.durationSeconds,
    });
  }

  function onDemoPitch() {
    runFullPipeline({
      audioBlobForTranscribe: null,
      presetTranscript: DEMO_PITCH.transcript,
      durationSeconds: DEMO_PITCH.durationSeconds,
    });
  }

  async function onUploadAudio(file: File) {
    // Estimate duration from audio metadata before sending.
    const duration = await estimateAudioDuration(file);
    runFullPipeline({
      audioBlobForTranscribe: file,
      presetTranscript: null,
      durationSeconds: duration,
    });
  }

  return (
    <div className="mx-auto max-w-[960px] px-9 pt-10 pb-32 sm:px-9 max-sm:px-5 max-sm:pt-7 max-sm:pb-24">
      <Topbar
        onHistory={() => {
          resetAll();
          setScreen("history");
        }}
      />

      {screen === "landing" && (
        <LandingScreen
          error={landingError}
          onStart={startRecording}
          onDemo={onDemoPitch}
          onUpload={onUploadAudio}
        />
      )}

      {screen === "recording" && (
        <RecordingScreen
          elapsedSeconds={elapsedSeconds}
          onCancel={cancelRecording}
          onStop={onStopAndEvaluate}
        />
      )}

      {screen === "processing" && (
        <ProcessingScreen step={processingStep} />
      )}

      {screen === "results" && result && (
        <ResultsScreen
          result={result}
          audioUrl={audioUrl}
          onBack={() => {
            resetAll();
            setScreen("landing");
          }}
          onRecordAgain={startRecording}
        />
      )}

      {screen === "error" && errorState && (
        <ErrorScreen
          error={errorState}
          onRetry={retryLastRun}
          onBack={() => {
            resetAll();
            setScreen("landing");
          }}
        />
      )}

      {screen === "history" && (
        <HistoryScreen
          onOpenEntry={(entry) => {
            setResult(entry.result);
            setScreen("results");
          }}
          onBack={() => {
            resetAll();
            setScreen("landing");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Topbar ------------------------------ */

function Topbar({ onHistory }: { onHistory: () => void }) {
  return (
    <div className="flex items-center justify-between pb-7 mb-12 border-b border-line-soft">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-dim">
        <BrandMark />
        <span>Elevator / Pitch / Evaluator</span>
      </div>
      <div className="hidden sm:flex gap-6 font-mono text-[11px] tracking-[0.14em] uppercase text-ink-mute">
        <button
          type="button"
          onClick={onHistory}
          className="bg-transparent border-0 p-0 font-inherit tracking-inherit uppercase text-inherit cursor-pointer hover:text-ink"
        >
          History
        </button>
        <a href="#rubric" className="hover:text-ink">
          Rubric
        </a>
        <a
          href="https://github.com/IanHSDavis/elevator-pitch-evaluator"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink"
        >
          Source
        </a>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative grid place-items-center w-[14px] h-[14px] rounded-[2px] bg-ink">
      <div className="w-[4px] h-[8px] rounded-[1px] bg-bg" />
    </div>
  );
}

/* ---------------------------- Landing ---------------------------- */

function LandingScreen({
  error,
  onStart,
  onDemo,
  onUpload,
}: {
  error: ErrorState | null;
  onStart: () => void;
  onDemo: () => void;
  onUpload: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="fade-in">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
        A Coaching Instrument · v0.4
      </div>

      <div className="mt-7 grid grid-cols-[1fr_auto] gap-10 items-end max-sm:grid-cols-1 max-sm:gap-6">
        <h1 className="font-serif m-0 text-[88px] leading-[0.95] tracking-[-0.025em] font-normal max-sm:text-[64px]">
          Say it
          <br />
          in <em className="text-ink-dim">sixty</em>
          <br />
          seconds.
        </h1>
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-faint leading-[1.9] text-right max-sm:text-left">
          Target 60–90s
          <br />
          Whisper · transcribe
          <br />
          Claude · evaluate
        </div>
      </div>

      <p className="mt-7 max-w-[48ch] text-[18px] leading-[1.55] font-light text-ink-dim m-0">
        Record an elevator pitch. We transcribe it, score it against a
        five-dimension rubric, and hand back blunt coaching notes — line by
        line. No cheerleading.
      </p>

      <RubricStrip />

      <MatrixAccordion
        id="rubric"
        eyebrow="The Rubric · Full Matrix"
        label="See what each dimension looks like at Exceeds, Meets, Developing."
        sub="Scoring is a gradient, not pass/fail. Expand to read the criteria."
        defaultOpen={false}
      />

      <div className="mt-[88px] grid grid-cols-2 gap-14 items-center max-[820px]:grid-cols-1 max-[820px]:gap-10">
        <div className="flex flex-col items-start gap-7">
          <RecordButton onClick={onStart} />
          <div className="flex flex-col gap-2.5">
            <div className="font-serif text-[40px] leading-[1.02] tracking-[-0.01em]">
              Press to <em className="text-ink-dim">record.</em>
            </div>
            <div className="text-[13.5px] text-ink-mute max-w-[34ch] leading-[1.5]">
              Grant microphone access when asked. Stop any time — we'll only
              judge what you give us.
            </div>
          </div>
          <div className="flex gap-6 mt-1.5 font-mono text-[11px] tracking-[0.12em] uppercase">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-transparent border-0 text-ink-dim cursor-pointer p-0 border-b border-line pb-[3px] hover:text-ink hover:border-ink"
            >
              Upload audio instead
            </button>
            <button
              type="button"
              onClick={onDemo}
              className="bg-transparent border-0 text-ink-dim cursor-pointer p-0 border-b border-line pb-[3px] hover:text-ink hover:border-ink"
            >
              Try a demo pitch
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        <SpecsTable />
      </div>

      {error && (
        <div className="mt-10 border border-[color-mix(in_oklch,var(--dev)_40%,transparent)] bg-[color-mix(in_oklch,var(--dev)_6%,transparent)] text-ink px-5 py-4 rounded">
          <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-dev mb-1">
            {error.title}
          </div>
          <div className="text-[14px] leading-[1.55] text-ink">
            {error.message}
          </div>
          {error.hint && (
            <div className="text-[13px] leading-[1.5] text-ink-dim mt-2">
              {error.hint}
            </div>
          )}
        </div>
      )}

      <div className="mt-[100px] pt-8 border-t border-line-soft flex justify-between items-end gap-6 font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-faint max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>Ver 0.5.0 · Built for practice, not performance.</div>
        <div>claude-opus-4-7</div>
      </div>
    </main>
  );
}

function RubricStrip() {
  const cells = [
    ...DIMENSIONS.map((d) => ({
      num: String(d.index).padStart(2, "0"),
      title: d.shortLabel,
      sub: d.shortSub,
    })),
    {
      num: "05",
      title: TIMING.shortLabel,
      sub: TIMING.shortSub,
    },
  ];

  return (
    <div className="mt-[72px] grid grid-cols-5 border-t border-b border-line-soft max-sm:grid-cols-2">
      {cells.map((c, i) => (
        <div
          key={c.num}
          className={`p-[22px_20px] min-h-[130px] flex flex-col justify-between ${
            i < cells.length - 1 ? "border-r border-line-soft" : ""
          } max-sm:[&:nth-child(2n)]:border-r-0 max-sm:border-b max-sm:border-line-soft`}
        >
          <div className="font-mono text-[11px] text-ink-faint tracking-[0.12em]">
            {c.num}
          </div>
          <div>
            <div className="text-[15px] font-medium leading-[1.3] text-ink">
              {c.title}
            </div>
            <div className="text-[12.5px] text-ink-mute leading-[1.4] mt-1.5">
              {c.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Start recording"
      className="relative w-40 h-40 rounded-full bg-ink grid place-items-center border-0 cursor-pointer transition-[transform,background] duration-200 hover:scale-[1.03] hover:bg-[oklch(0.48_0.17_30)] shadow-[0_20px_50px_-24px_oklch(0.30_0.06_60/0.45)] group"
    >
      <div className="absolute -inset-3 rounded-full border border-line opacity-60 pointer-events-none" />
      <div className="absolute -inset-6 rounded-full border border-dashed border-line opacity-35 animate-slowspin pointer-events-none" />
      <div className="w-7 h-7 rounded-full bg-[oklch(0.48_0.17_30)] transition-all duration-200 group-hover:bg-bg group-hover:w-8 group-hover:h-8" />
    </button>
  );
}

function SpecsTable() {
  const rows = [
    { k: "Length", v: "60–90 seconds", e: "· ±15s tolerated" },
    { k: "Format", v: "Spoken pitch", e: "· one take" },
    {
      k: "Privacy",
      v: "Audio to Whisper, transcript to Claude",
      e: "· nothing stored",
    },
    { k: "Scoring", v: "Exceeds · Meets · Developing", e: null },
    {
      k: "Output",
      v: "Transcript · 5 dimension scores · coaching notes",
      e: null,
    },
  ];

  return (
    <div className="flex flex-col border-l border-line-soft pl-7">
      {rows.map((r, i) => (
        <div
          key={r.k}
          className={`grid grid-cols-[110px_1fr] gap-5 py-3.5 text-[13px] ${
            i < rows.length - 1 ? "border-b border-line-soft" : ""
          }`}
        >
          <div className="font-mono text-[10.5px] text-ink-faint tracking-[0.14em] uppercase pt-0.5">
            {r.k}
          </div>
          <div className="text-ink leading-[1.5]">
            {r.v}
            {r.e && <span className="text-ink-mute"> {r.e}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- Matrix accordion ---------------------------- */

function MatrixAccordion({
  id,
  eyebrow,
  label,
  sub,
  defaultOpen,
}: {
  id?: string;
  eyebrow: string;
  label: string;
  sub: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={id}
      className="mt-12 border-t border-b border-line-soft"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-transparent border-0 text-ink p-[22px_0] flex justify-between items-center gap-4 font-inherit cursor-pointer text-left"
      >
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-faint">
            {eyebrow}
          </div>
          <div className="text-[17px] font-medium tracking-[-0.005em]">
            {label}
          </div>
          <div className="text-[13px] text-ink-mute font-light">{sub}</div>
        </div>
        <div
          className="w-7 h-7 border border-line rounded-full grid place-items-center text-ink-dim transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <svg
            width="12"
            height="8"
            viewBox="0 0 12 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 1l5 5 5-5" />
          </svg>
        </div>
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-[440ms] ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ maxHeight: open ? "2400px" : "0px" }}
      >
        <div className="pt-2 pb-9">
          <Matrix />
        </div>
      </div>
    </div>
  );
}

function Matrix() {
  const headers: { text: string; cls: string }[] = [
    { text: "Dimension", cls: "text-ink-faint" },
    { text: "Exceeds", cls: "text-strong" },
    { text: "Meets", cls: "text-meets" },
    { text: "Developing", cls: "text-dev" },
  ];
  const rows = [
    ...DIMENSIONS.map((d) => ({
      num: String(d.index).padStart(2, "0"),
      title: d.title,
      cells: PERFORMANCE_LEVELS.map((lvl) => d.descriptors[lvl]),
    })),
    {
      num: "05",
      title: TIMING.title,
      cells: PERFORMANCE_LEVELS.map((lvl) => TIMING.descriptors[lvl]),
    },
  ];

  return (
    <div className="grid grid-cols-[minmax(150px,1fr)_1.6fr_1.6fr_1.6fr] border-t border-line-soft max-[820px]:grid-cols-1">
      {headers.map((h) => (
        <div
          key={h.text}
          className={`font-mono text-[10.5px] tracking-[0.16em] uppercase font-medium py-3.5 pr-5 ${h.cls} first:pl-0 max-[820px]:hidden`}
        >
          {h.text}
        </div>
      ))}
      {rows.map((row) => (
        <RowCells key={row.num} row={row} />
      ))}
    </div>
  );
}

function RowCells({
  row,
}: {
  row: { num: string; title: string; cells: string[] };
}) {
  return (
    <>
      <div className="text-[14px] leading-[1.55] py-[18px] pr-5 border-b border-line-soft font-medium text-ink max-[820px]:pt-5 max-[820px]:pb-1 max-[820px]:border-t max-[820px]:border-b-0 max-[820px]:border-t-line-soft">
        <span className="block font-mono text-[10.5px] text-ink-faint tracking-[0.12em] mb-1 font-normal">
          {row.num}
        </span>
        {row.title}
      </div>
      {row.cells.map((cell, i) => (
        <div
          key={i}
          data-label={
            i === 0 ? "Exceeds" : i === 1 ? "Meets" : "Developing"
          }
          className="text-[14px] leading-[1.55] py-[18px] pr-6 border-b border-line-soft text-ink-dim italic font-light max-[820px]:py-2.5 max-[820px]:border-b-0 max-[820px]:before:content-[attr(data-label)] max-[820px]:before:block max-[820px]:before:font-mono max-[820px]:before:text-[10px] max-[820px]:before:tracking-[0.14em] max-[820px]:before:uppercase max-[820px]:before:text-ink-faint max-[820px]:before:mb-1 max-[820px]:before:not-italic"
        >
          {cell}
        </div>
      ))}
    </>
  );
}

/* ---------------------------- Recording ---------------------------- */

function RecordingScreen({
  elapsedSeconds,
  onCancel,
  onStop,
}: {
  elapsedSeconds: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  const secs = Math.floor(elapsedSeconds);
  const ms = Math.floor((elapsedSeconds - secs) * 100);
  const timerText = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const msText = `.${String(ms).padStart(2, "0")}`;
  const fillPct = Math.min(100, (elapsedSeconds / 90) * 100);

  return (
    <main className="fade-in mt-16">
      <div className="flex items-center gap-3.5 mb-12">
        <div className="w-2.5 h-2.5 rounded-full animate-pulse-soft bg-[oklch(0.68_0.16_25)]" />
        <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-dim">
          Recording · Mic Live
        </div>
        <div className="ml-auto font-serif text-[72px] leading-none tracking-[-0.02em] tabular-nums">
          {timerText}
          <span className="text-[28px] text-ink-mute align-[6px] ml-1.5">
            {msText}
          </span>
        </div>
      </div>

      <Waveform />

      <div className="flex justify-between items-center font-mono text-[11px] tracking-[0.14em] uppercase text-ink-mute mt-10 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="flex gap-2.5 items-center">
          <span>Target Window</span>
          <div className="w-60 h-0.5 bg-line relative overflow-hidden rounded-[1px]">
            <div className="absolute -top-[3px] -bottom-[3px] w-px bg-ink-dim left-[40%]" />
            <div className="absolute -top-[3px] -bottom-[3px] w-px bg-ink-dim left-[60%]" />
            <div
              className="absolute inset-0 bg-ink transition-[width] duration-[120ms] linear rounded-[1px]"
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <span>{secs} / 90s</span>
        </div>
        <div>60–90s · ideal</div>
      </div>

      <div className="flex gap-3.5 mt-14 justify-center">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onStop}>
          <span className="inline-block w-2.5 h-2.5 bg-current" />
          Stop &amp; Evaluate
        </Button>
      </div>
    </main>
  );
}

function Waveform() {
  const WAVE_COUNT = 120;
  const [bars, setBars] = useState<number[]>(() =>
    new Array(WAVE_COUNT).fill(3),
  );
  const headRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());

  useEffect(() => {
    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000;
      const amp = Math.max(
        4,
        Math.abs(Math.sin(t * 6) * 60) + Math.random() * 50 + 10,
      );

      setBars((prev) => {
        const next = prev.slice();
        if (headRef.current < next.length) {
          next[headRef.current] = amp;
        } else {
          for (let i = 0; i < next.length - 1; i++) next[i] = next[i + 1];
          next[next.length - 1] = amp;
        }
        headRef.current++;
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="h-[220px] flex items-center gap-[3px] border-t border-b border-line-soft my-10 relative">
      <div className="absolute left-0 right-0 top-1/2 h-px bg-line-soft" />
      {bars.map((h, i) => {
        const isPast =
          headRef.current > bars.length &&
          i < bars.length - 30;
        return (
          <div
            key={i}
            className={`flex-1 ${isPast ? "bg-ink-mute" : "bg-ink"} min-h-[2px] rounded-[1px] transition-[height] duration-[80ms] ease-out`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/* ---------------------------- Processing ---------------------------- */

function ProcessingScreen({ step }: { step: ProcessingStep }) {
  const steps = [
    "Transcribing audio via Whisper",
    "Parsing structure & timing",
    "Scoring against the five-dimension rubric",
    "Writing coaching notes",
  ];

  return (
    <main className="fade-in mt-16">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
        Evaluating
      </div>
      <div className="font-serif text-[56px] leading-[1.02] tracking-[-0.015em] max-w-[18ch] mt-6 max-sm:text-[40px]">
        Listening closely.{" "}
        <em className="text-ink-dim">Give us a moment.</em>
      </div>

      <div className="mt-14 flex flex-col border-t border-line-soft">
        {steps.map((s, i) => {
          const state =
            step > i ? "done" : step === i ? "active" : "queued";
          return (
            <div
              key={i}
              className={`grid grid-cols-[40px_1fr_auto] gap-6 py-[22px] border-b border-line-soft items-center`}
            >
              <div className="font-mono text-[11px] text-ink-faint tracking-[0.12em]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                className={`text-[15px] ${
                  state === "active"
                    ? "text-ink"
                    : state === "done"
                      ? "text-ink-mute"
                      : "text-ink-dim"
                }`}
              >
                {s}
              </div>
              <div
                className={`font-mono text-[11px] tracking-[0.12em] uppercase flex items-center gap-2.5 ${
                  state === "active"
                    ? "text-ink"
                    : state === "done"
                      ? "text-strong"
                      : "text-ink-faint"
                }`}
              >
                {state === "queued"
                  ? "Queued"
                  : state === "active"
                    ? "Working"
                    : "Done"}
                {state === "active" && (
                  <span className="inline-block w-2 h-2 rounded-full bg-ink animate-pulse-soft" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

/* ---------------------------- Results ---------------------------- */

function ResultsScreen({
  result,
  audioUrl,
  onBack,
  onRecordAgain,
}: {
  result: EvaluationResult;
  audioUrl: string | null;
  onBack: () => void;
  onRecordAgain: () => void;
}) {
  const [copyLabel, setCopyLabel] = useState("Copy Report");
  const [activeRef, setActiveRef] = useState<number | null>(null);

  const segments = useMemo(() => {
    const highlights = result.dimensions
      .filter((d) => d.highlight && d.highlight.trim().length > 0)
      .map((d) => ({ phrase: d.highlight, ref: d.index }));
    return buildTranscriptSegments(result.transcript, highlights);
  }, [result]);

  const wordCount = useMemo(
    () =>
      result.transcript
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    [result.transcript],
  );

  const sessionId = useMemo(
    () => String(Math.floor(Math.random() * 9000) + 1000),
    [],
  );
  const timestamp = useMemo(() => formatTimestamp(new Date()), []);

  function onMarkClick(ref: number) {
    setActiveRef(ref);
    const row = document.getElementById(`row-${ref}`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.animate(
        [
          {
            background: "color-mix(in oklch, var(--dev) 10%, transparent)",
          },
          { background: "transparent" },
        ],
        { duration: 1200, easing: "ease-out" },
      );
    }
  }

  async function onCopy() {
    const text = buildPlaintextReport(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copied");
      setTimeout(() => setCopyLabel("Copy Report"), 1400);
    } catch {
      setCopyLabel("Copy failed");
      setTimeout(() => setCopyLabel("Copy Report"), 1400);
    }
  }

  return (
    <main className="fade-in">
      <div className="flex justify-between items-center gap-4 pb-7 border-b border-line-soft">
        <button
          type="button"
          onClick={onBack}
          className="group font-mono text-[11px] tracking-[0.14em] uppercase text-ink-dim bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-2 hover:text-ink"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-[3px]">
            ←
          </span>{" "}
          Back to record
        </button>
        <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint">
          Session · {sessionId} · {timestamp}
        </div>
      </div>

      {/* Verdict + score */}
      <div className="grid grid-cols-[1fr_auto] gap-10 items-end pt-[72px] pb-14 border-b border-line-soft max-sm:grid-cols-1 max-sm:gap-6">
        <div className="flex flex-col gap-5 self-end">
          <h2 className="font-serif text-[64px] leading-[1.02] tracking-[-0.018em] max-w-[16ch] m-0 max-sm:text-[44px]">
            {result.verdict}
          </h2>
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-mute">
            Overall · {LEVEL_LABELS[result.verdictLevel]} ·{" "}
            {result.verdictMet.met} of {result.verdictMet.total} dimensions
            meet
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-faint">
            Overall
          </div>
          <div className="font-serif text-[140px] leading-[0.9] tracking-[-0.03em] tabular-nums flex items-baseline gap-0.5 max-sm:text-[104px]">
            <span>{result.overallScore}</span>
            <span className="text-[38px] text-ink-mute leading-none">
              /100
            </span>
          </div>
          <div className="w-[180px] h-1 bg-line mt-2.5 relative rounded-[2px] overflow-hidden">
            <div
              className="absolute inset-0 bg-ink rounded-[2px] transition-[width] duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ width: `${result.overallScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Overall impression */}
      <section className="pt-7 pb-10 border-b border-line-soft">
        <div className="flex justify-between items-baseline pt-5 pb-4.5 border-b border-line-soft">
          <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
            Overall Impression
          </div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint">
            {result.verdictMet.total - result.verdictMet.met} of{" "}
            {result.verdictMet.total} dimensions need work
          </div>
        </div>
        <p className="mt-6 text-[17px] leading-[1.65] text-ink max-w-[70ch] font-light">
          {result.overallImpression}
        </p>
      </section>

      {/* Transcript */}
      <section>
        <div className="flex justify-between items-baseline pt-9 pb-4.5 border-b border-line-soft">
          <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
            Transcript
          </div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint">
            {Math.round(result.timing.durationSeconds)}s · {wordCount} words
            · click a highlight to see the note
          </div>
        </div>

        <p className="transcript pt-7 pb-2 text-[22px] leading-[1.55] font-light tracking-[-0.005em] text-ink max-sm:text-[18px]">
          {segments.map((seg, i) =>
            seg.ref != null ? (
              <mark
                key={i}
                data-ref={seg.ref}
                onClick={() => onMarkClick(seg.ref!)}
                className={activeRef === seg.ref ? "active" : ""}
              >
                {seg.text}
                <span className="ref">{toSuperscript(seg.ref)}</span>
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>

        <div className="flex gap-6 pt-3.5 font-mono text-[10.5px] tracking-[0.12em] uppercase text-ink-faint max-sm:flex-col max-sm:gap-2">
          <span className="inline-flex items-center gap-2 before:content-[''] before:inline-block before:w-2.5 before:h-2.5 before:bg-[var(--hl-bg)] before:border-b before:border-dev">
            Highlighted = referenced in coaching
          </span>
          <span className="ml-auto max-sm:ml-0">Click to jump to the note</span>
        </div>

        {audioUrl && (
          <div className="mt-7 p-6 bg-bg-elev border border-line-soft rounded flex items-center gap-5">
            <audio controls src={audioUrl} className="w-full" preload="metadata" />
          </div>
        )}
      </section>

      {/* Dimensions */}
      <section>
        <div className="flex justify-between items-baseline pt-9 pb-4.5 border-b border-line-soft">
          <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
            The Five Dimensions
          </div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint">
            Scored + coached
          </div>
        </div>

        <div className="pt-6">
          {/* Timing — compact */}
          <div
            id="row-5"
            className="grid grid-cols-[34px_1fr_auto] gap-7 py-8 border-b border-line-soft items-start max-sm:grid-cols-[28px_1fr] max-sm:grid-rows-[auto_auto]"
          >
            <div className="font-mono text-[11px] text-ink-faint tracking-[0.12em] pt-1">
              00
            </div>
            <div className="flex items-baseline gap-3.5 flex-wrap">
              <div className="text-[17px] font-medium">{result.timing.title}</div>
              <div className="font-mono text-[12px] text-ink-dim tracking-[0.04em]">
                {result.timing.note}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2.5 max-sm:col-span-2 max-sm:flex-row max-sm:items-center">
              <Badge level={result.timing.level} label={result.timing.badgeLabel} />
            </div>
          </div>

          {result.dimensions.map((dim) => (
            <div
              key={dim.key}
              id={`row-${dim.index}`}
              className="grid grid-cols-[34px_1fr_auto] gap-7 py-8 border-b border-line-soft items-start max-sm:grid-cols-[28px_1fr] max-sm:grid-rows-[auto_auto]"
            >
              <div className="font-mono text-[11px] text-ink-faint tracking-[0.12em] pt-1">
                {String(dim.index).padStart(2, "0")}
              </div>
              <div className="flex flex-col gap-3.5 min-w-0">
                <div className="text-[22px] font-medium leading-[1.2] tracking-[-0.01em]">
                  {dim.title}
                </div>
                <div className="text-[14px] text-ink-dim italic leading-[1.55] border-l-2 border-line pl-3.5">
                  {dim.evidence}
                </div>
                <div className="text-[15px] leading-[1.6] text-ink max-w-[68ch]">
                  {dim.coaching}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2.5 max-sm:col-span-2 max-sm:flex-row max-sm:items-center">
                <Badge level={dim.level} />
                <div className="font-serif text-[32px] leading-none tabular-nums text-ink">
                  {dim.subscore}
                  <span className="text-[14px] text-ink-mute">/5</span>
                </div>
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-faint">
                  Weight · {Math.round(dim.weight * 100)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <MatrixAccordion
        eyebrow="Reference · Full Rubric"
        label="Compare your scores against the criteria."
        sub="What Exceeds, Meets, and Developing look like per dimension."
        defaultOpen={false}
      />

      <div className="mt-16 pt-8 border-t border-line-soft flex justify-between items-center gap-5 flex-wrap">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-ink-faint uppercase">
          Model {result.model} · Tokens in/out {result.usage.inputTokens}/
          {result.usage.outputTokens}
          {result.usage.cacheReadInputTokens &&
          result.usage.cacheReadInputTokens > 0
            ? ` · Cache hit ${result.usage.cacheReadInputTokens}`
            : ""}
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="ghost" onClick={onCopy}>
            {copyLabel}
          </Button>
          <Button variant="default" onClick={onBack}>
            New Recording
          </Button>
          <Button variant="primary" onClick={onRecordAgain}>
            Record Again →
          </Button>
        </div>
      </div>
    </main>
  );
}

/* ---------------------------- Common bits ---------------------------- */

function Badge({
  level,
  label,
}: {
  level: PerformanceLevel;
  label?: string;
}) {
  const palette = LEVEL_PALETTE[level];
  const tone =
    palette === "strong"
      ? "text-strong bg-[color-mix(in_oklch,var(--strong)_14%,transparent)]"
      : palette === "meets"
        ? "text-meets bg-[color-mix(in_oklch,var(--meets)_14%,transparent)]"
        : "text-dev bg-[color-mix(in_oklch,var(--dev)_14%,transparent)]";
  const dot =
    palette === "strong"
      ? "bg-strong"
      : palette === "meets"
        ? "bg-meets"
        : "bg-dev";
  return (
    <span
      className={`inline-flex items-center gap-2 py-1.5 px-3 rounded-full font-mono text-[10.5px] tracking-[0.14em] uppercase font-medium ${tone}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label ?? LEVEL_LABELS[level]}
    </span>
  );
}

function Button({
  variant = "default",
  onClick,
  children,
}: {
  variant?: "default" | "primary" | "ghost";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center gap-2.5 py-3.5 px-[26px] rounded-full font-inherit text-[13px] tracking-[0.02em] cursor-pointer transition-all duration-[160ms] ease border";
  const styles =
    variant === "primary"
      ? "bg-ink text-bg border-ink hover:bg-[oklch(0.32_0.02_60)]"
      : variant === "ghost"
        ? "bg-transparent border-transparent text-ink-dim hover:text-ink"
        : "bg-transparent border-line text-ink hover:bg-bg-elev hover:border-ink-mute";
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/* ---------------------------- History screen ---------------------------- */

function HistoryScreen({
  onOpenEntry,
  onBack,
}: {
  onOpenEntry: (entry: HistoryEntry) => void;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
    setHydrated(true);
  }, []);

  function onClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 2400);
      return;
    }
    clearHistory();
    setEntries([]);
    setConfirmClear(false);
  }

  if (!hydrated) {
    // Avoid SSR/CSR mismatch: render nothing until we have localStorage data.
    return <main className="fade-in mt-16" aria-hidden />;
  }

  if (entries.length === 0) {
    return (
      <main className="fade-in mt-16">
        <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
          History · Practice Ledger
        </div>
        <h2 className="font-serif text-[64px] leading-[1.02] tracking-[-0.018em] mt-6 max-w-[16ch] max-sm:text-[44px]">
          Nothing saved yet.
        </h2>
        <p className="mt-6 max-w-[52ch] text-[18px] leading-[1.55] font-light text-ink-dim">
          Record a pitch and it&apos;ll land here automatically. Your takes
          never leave this browser — history lives in local storage, not on a
          server.
        </p>
        <div className="mt-10">
          <Button variant="primary" onClick={onBack}>
            Record your first pitch
          </Button>
        </div>
      </main>
    );
  }

  // Sparkline series: oldest → newest so the eye reads time left→right.
  const chron = [...entries].reverse();
  const scores = chron.map((e) => e.result.overallScore);
  const avg = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );
  const latest = scores[scores.length - 1];

  return (
    <main className="fade-in">
      <div className="flex justify-between items-center gap-4 pb-7 border-b border-line-soft">
        <button
          type="button"
          onClick={onBack}
          className="group font-mono text-[11px] tracking-[0.14em] uppercase text-ink-dim bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-2 hover:text-ink"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-[3px]">
            ←
          </span>{" "}
          Back to record
        </button>
        <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">
          {entries.length} {entries.length === 1 ? "take" : "takes"} · avg{" "}
          {avg}/100 · latest {latest}/100
        </div>
      </div>

      <div className="pt-[72px] pb-12 border-b border-line-soft">
        <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
          History · Practice Ledger
        </div>
        <h2 className="font-serif text-[64px] leading-[1.02] tracking-[-0.018em] mt-6 max-w-[18ch] max-sm:text-[44px]">
          Your last{" "}
          <em className="text-ink-dim">
            {entries.length === 1 ? "take" : `${entries.length} takes`}.
          </em>
        </h2>
        <div className="mt-10">
          <Sparkline scores={scores} />
        </div>
      </div>

      <section>
        <div className="flex justify-between items-baseline pt-9 pb-4.5 border-b border-line-soft">
          <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-mute">
            Sessions
          </div>
          <div className="font-mono text-[11px] tracking-[0.12em] text-ink-faint">
            Newest first
          </div>
        </div>

        <div>
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              onOpen={() => onOpenEntry(entry)}
            />
          ))}
        </div>
      </section>

      <div className="mt-16 pt-8 border-t border-line-soft flex justify-between items-center flex-wrap gap-4">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-ink-faint uppercase">
          Stored locally · never sent to any server
        </div>
        <Button
          variant={confirmClear ? "primary" : "ghost"}
          onClick={onClear}
        >
          {confirmClear ? "Confirm clear" : "Clear history"}
        </Button>
      </div>
    </main>
  );
}

function HistoryRow({
  entry,
  onOpen,
}: {
  entry: HistoryEntry;
  onOpen: () => void;
}) {
  const date = new Date(entry.savedAt);
  const dateLabel = formatTimestamp(date);
  const { result } = entry;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left bg-transparent border-0 p-0 cursor-pointer border-b border-line-soft"
    >
      <div className="grid grid-cols-[110px_1fr_auto_auto] gap-6 py-6 items-center max-sm:grid-cols-[1fr_auto] max-sm:grid-rows-[auto_auto] max-sm:gap-x-4 max-sm:gap-y-2">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-faint group-hover:text-ink-dim max-sm:row-start-1 max-sm:col-start-1">
          {dateLabel}
        </div>
        <div className="text-[17px] leading-[1.35] text-ink font-light group-hover:text-ink max-sm:row-start-2 max-sm:col-span-2">
          {result.verdict}
        </div>
        <div className="max-sm:row-start-1 max-sm:col-start-2 max-sm:justify-self-end">
          <Badge level={result.verdictLevel} />
        </div>
        <div className="font-serif text-[28px] leading-none tabular-nums text-ink max-sm:row-start-1 max-sm:col-start-2 max-sm:hidden">
          {result.overallScore}
          <span className="text-[13px] text-ink-mute">/100</span>
        </div>
      </div>
    </button>
  );
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length === 0) return null;

  const width = 800;
  const height = 64;
  const barGap = 3;
  const totalBars = scores.length;
  const barWidth = Math.max(
    2,
    (width - barGap * (totalBars - 1)) / totalBars,
  );

  function bandClass(score: number): string {
    if (score >= 75) return "fill-strong";
    if (score >= 55) return "fill-meets";
    return "fill-dev";
  }

  return (
    <div className="w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Score trend across ${scores.length} sessions`}
      >
        <line
          x1={0}
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          stroke="var(--line-soft)"
          strokeWidth={1}
        />
        {scores.map((score, i) => {
          const h = Math.max(2, (score / 100) * (height - 4));
          const x = i * (barWidth + barGap);
          return (
            <rect
              key={i}
              x={x}
              y={height - h}
              width={barWidth}
              height={h}
              rx={1}
              className={bandClass(score)}
            />
          );
        })}
      </svg>
      <div className="flex justify-between pt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-ink-faint">
        <span>Older</span>
        <span>Newer</span>
      </div>
    </div>
  );
}

/* ---------------------------- Error screen ---------------------------- */

function ErrorScreen({
  error,
  onRetry,
  onBack,
}: {
  error: ErrorState;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <main className="fade-in mt-16">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-dev">
        Error · {error.kind.replace(/_/g, " ")}
      </div>
      <div className="font-serif text-[56px] leading-[1.02] tracking-[-0.015em] max-w-[18ch] mt-6 max-sm:text-[40px]">
        {error.title}
      </div>
      <p className="mt-6 text-[17px] leading-[1.65] text-ink max-w-[60ch] font-light">
        {error.message}
      </p>
      {error.hint && (
        <p className="mt-3 text-[14px] leading-[1.5] text-ink-dim max-w-[60ch]">
          {error.hint}
        </p>
      )}
      <div className="flex gap-3 mt-12 flex-wrap">
        {error.canRetry && (
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="default" onClick={onBack}>
          Back to record
        </Button>
      </div>
    </main>
  );
}

/* ---------------------------- Helpers ---------------------------- */

function pickMimeType(): string {
  if (typeof window === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function pickExt(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

async function estimateAudioDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 60);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(60);
    };
    audio.src = url;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Turn a getUserMedia rejection into a typed ErrorState with a useful message.
 * Recognized DOMException `name` values:
 *   NotAllowedError — user (or browser) denied mic permission
 *   NotFoundError / DevicesNotFoundError — no mic hardware
 *   NotReadableError — mic is in use by another app
 *   SecurityError — insecure context
 */
function classifyMicError(err: unknown): ErrorState {
  const name =
    err instanceof Error && "name" in err
      ? (err as Error & { name: string }).name
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      kind: "mic_denied",
      title: "Microphone access was blocked",
      message:
        "Your browser blocked microphone access for this site. You'll need to re-enable it in the site settings, then try again.",
      hint: "In Chrome: click the lock icon in the address bar → Site settings → Microphone → Allow.",
      canRetry: false,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      kind: "mic_missing",
      title: "No microphone detected",
      message:
        "Your browser couldn't find a mic. Plug one in, or try a different device, then reload and try again.",
      canRetry: false,
    };
  }
  if (name === "NotReadableError") {
    return {
      kind: "mic_generic",
      title: "Your mic is busy",
      message:
        "Another app may be using the microphone. Close it and try again.",
      canRetry: false,
    };
  }
  const fallback = err instanceof Error ? err.message : String(err);
  return {
    kind: "mic_generic",
    title: "Microphone access failed",
    message: fallback,
    canRetry: false,
  };
}

// Marker so thrown ErrorState objects can be unwrapped later.
const ERROR_STATE_MARKER = "__epe_error_state__";

function errorObject(state: ErrorState): Error {
  const e = new Error(state.title);
  (e as unknown as Record<string, unknown>)[ERROR_STATE_MARKER] = state;
  return e;
}

function toErrorState(err: unknown): ErrorState {
  if (
    err instanceof Error &&
    (err as unknown as Record<string, unknown>)[ERROR_STATE_MARKER]
  ) {
    return (err as unknown as Record<string, unknown>)[
      ERROR_STATE_MARKER
    ] as ErrorState;
  }
  return {
    kind: "api_failure",
    title: "Something went wrong",
    message: err instanceof Error ? err.message : String(err),
    canRetry: true,
  };
}

function formatTimestamp(date: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${months[date.getMonth()]} ${date.getDate()} · ${hour}:${minute}${ampm}`;
}

function buildPlaintextReport(result: EvaluationResult): string {
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
