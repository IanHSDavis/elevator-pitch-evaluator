"use client";

import { useState } from "react";
import type { EvaluationResult } from "@/lib/evaluate";
import { LEVEL_LABELS, type PerformanceLevel } from "@/lib/rubric";

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

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("60");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          durationSeconds: Number(durationSeconds),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Evaluation failed.");
      }
      setResult(data as EvaluationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Elevator Pitch Evaluator
          </h1>
          <p className="text-lg leading-7 text-zinc-600 dark:text-zinc-400">
            Paste a pitch transcript, enter its length, and get structured,
            coaching-oriented feedback against a five-dimension rubric.
          </p>
          <p className="text-sm text-zinc-500">
            Audio capture is coming next. For now, provide the transcript and
            duration manually.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
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
              placeholder="Paste what the speaker said. Aim for a 60–90 second pitch."
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
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              className="w-32 rounded-lg border border-zinc-300 bg-white p-2 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={loading || transcript.trim().length === 0}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {loading ? "Evaluating…" : "Evaluate pitch"}
            </button>
          </div>

          {error ? (
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          ) : null}
        </form>

        {result ? <ResultsView result={result} /> : null}
      </main>
    </div>
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
