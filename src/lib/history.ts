import type { EvaluationResult } from "./evaluate";

const STORAGE_KEY = "epe_history_v1";
const MAX_ENTRIES = 50;

export type HistoryEntry = {
  /** Unique per-entry ID (different from the cosmetic session display ID). */
  id: string;
  /** ISO timestamp at save time. */
  savedAt: string;
  /** The full evaluation result — enough to re-render the results view. */
  result: EvaluationResult;
};

function available(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__epe_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadHistory(): HistoryEntry[] {
  if (!available()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Trust-but-filter: drop any entry that doesn't look right.
    return parsed.filter(
      (e): e is HistoryEntry =>
        e &&
        typeof e === "object" &&
        typeof e.id === "string" &&
        typeof e.savedAt === "string" &&
        e.result &&
        typeof e.result.overallScore === "number",
    );
  } catch {
    return [];
  }
}

export function saveToHistory(result: EvaluationResult): HistoryEntry | null {
  if (!available()) return null;
  const entry: HistoryEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    savedAt: new Date().toISOString(),
    result,
  };
  try {
    const existing = loadHistory();
    // Newest-first; cap at MAX_ENTRIES.
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return entry;
  } catch {
    // Quota exceeded or serialization failed — silently no-op. History is
    // a best-effort convenience, not critical to the evaluation flow.
    return null;
  }
}

export function clearHistory(): void {
  if (!available()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function deleteEntry(id: string): void {
  if (!available()) return;
  try {
    const next = loadHistory().filter((e) => e.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
