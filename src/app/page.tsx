export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 px-8 py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Elevator Pitch Evaluator
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Record a 60–90 second elevator pitch. Get structured, coaching-oriented
          feedback against a five-dimension rubric — powered by Whisper for
          transcription and Claude for evaluation.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Early MVP. Audio capture and evaluation pipeline under construction.
        </p>
      </main>
    </div>
  );
}
