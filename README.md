# Elevator Pitch Evaluator

An open-source tool that listens to a 60–90 second elevator pitch and returns structured, coaching-oriented feedback against a rubric — powered by Whisper for transcription and Claude for evaluation.

Built as a portfolio project to demonstrate enablement design and AI-native product development.

## What it does

1. You record an elevator pitch (up to ~2 minutes) in the browser.
2. Whisper transcribes the audio and returns word-level timestamps so the pitch's duration is measured, not inferred.
3. Claude evaluates the transcript against a fixed rubric — five dimensions, three performance levels each — and returns specific coaching language tied to what you actually said.
4. You get a clean feedback artifact you can read, share, or use to iterate.

## The rubric

The evaluation rubric is the heart of this project. It's derived from the author's prior work on enterprise pitch-evaluation programs and is intentionally **company- and product-agnostic** for the MVP. See [`RUBRIC.md`](./RUBRIC.md) for the full matrix.

## Stack

- **Next.js 16 (App Router)** + **TypeScript** + **Tailwind 4**
- **OpenAI Whisper API** for speech-to-text with timestamps
- **Anthropic Claude API** for evaluation
- **Vercel** for deployment (free tier compatible)

## Getting started

```bash
# Install dependencies
npm install

# Configure API keys
cp .env.local.example .env.local
# then edit .env.local with your Anthropic + OpenAI keys

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note on the `dev` script:** it's prefixed with `env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL` so that any `ANTHROPIC_*` values inherited from the parent shell (e.g. when the dev server is launched from inside Claude Code, which exports its own SDK config) get stripped before Next.js loads `.env.local`. Without this, an empty/unrelated shell value would silently override the file. Harmless when those vars aren't set.

## Status

Early MVP. Audio capture → transcription → evaluation pipeline under construction. Public repo so you can watch it come together.

## License

MIT
