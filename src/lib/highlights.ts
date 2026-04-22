export type TranscriptSegment = {
  text: string;
  ref: number | null; // if non-null, this segment is a highlight with this ref id
};

/**
 * Build an ordered list of transcript segments by splicing in highlight phrases.
 * Each highlight is tied to a ref id (typically the dimension's 1-based index).
 *
 * Matching strategy: exact → case-insensitive → give up (skip that highlight).
 * Earlier highlights win over later ones when they overlap.
 */
export function buildTranscriptSegments(
  transcript: string,
  highlights: Array<{ phrase: string; ref: number }>,
): TranscriptSegment[] {
  type Range = { start: number; end: number; ref: number };
  const ranges: Range[] = [];

  for (const { phrase, ref } of highlights) {
    if (!phrase || !phrase.trim()) continue;

    const needle = phrase.trim();
    let start = transcript.indexOf(needle);

    if (start === -1) {
      const lower = transcript.toLowerCase();
      start = lower.indexOf(needle.toLowerCase());
    }

    if (start === -1) continue;

    const end = start + needle.length;

    // Skip if it overlaps with an earlier accepted range.
    const overlaps = ranges.some(
      (r) => !(end <= r.start || start >= r.end),
    );
    if (overlaps) continue;

    ranges.push({ start, end, ref });
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ text: transcript.slice(cursor, r.start), ref: null });
    }
    segments.push({ text: transcript.slice(r.start, r.end), ref: r.ref });
    cursor = r.end;
  }
  if (cursor < transcript.length) {
    segments.push({ text: transcript.slice(cursor), ref: null });
  }

  return segments;
}

const SUPERSCRIPTS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
export function toSuperscript(n: number): string {
  return n
    .toString()
    .split("")
    .map((c) => (c >= "0" && c <= "9" ? SUPERSCRIPTS[Number(c)] : c))
    .join("");
}
