/**
 * Extract evenly-spaced keyframes from a recorded video Blob and return them
 * as base64-encoded JPEGs sized 640×480.
 *
 * Why these knobs:
 * - **4 frames** — the visual rubric only needs enough frames to read posture
 *   and gaze trajectory; 4 captures the start/early/late/end shape without
 *   inflating cost. Six frames added <2% accuracy in the saved cost study
 *   per `plan_video.md`.
 * - **640×480** — Anthropic's pricing buckets images at (w×h)/750 tokens.
 *   At 640×480, each frame is ~410 tokens. Native webcam resolution
 *   (typically 1280×720) would be ~1230 tokens/frame — 3× cheaper at the
 *   smaller size with no quality regression for presence-class judgments.
 * - **JPEG @ 0.85** — visually indistinguishable from the source webcam
 *   feed at this frame size, ~10× smaller than PNG. The frames go through
 *   base64 over JSON to the API route, so size matters for upload latency.
 * - **Sample window 5–95%** — the very first and last 200ms of a recording
 *   are unreliable: the camera may still be auto-exposing at the start,
 *   and the user is often reaching for the stop button at the very end.
 *   Trimming to 5–95% gets cleaner frames without losing the bookends.
 */

const FRAME_COUNT = 4;
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const JPEG_QUALITY = 0.85;
const SAMPLE_START_PCT = 0.05;
const SAMPLE_END_PCT = 0.95;

export type ExtractedFrame = {
  /** Base64 JPEG payload — NO `data:image/jpeg;base64,` prefix. */
  base64: string;
  /** The video timestamp this frame was sampled from, in seconds. */
  timestampSeconds: number;
};

/**
 * Sample N evenly-spaced frames from `videoBlob`, resize each to 640×480,
 * encode as base64 JPEG. Returns frames in chronological order.
 *
 * Throws if the browser can't decode the video metadata or seek reliably.
 * The page handles the throw by surfacing a "couldn't read your video"
 * error rather than blocking the score.
 */
export async function extractKeyframes(
  videoBlob: Blob,
): Promise<ExtractedFrame[]> {
  const blobUrl = URL.createObjectURL(videoBlob);

  try {
    const video = document.createElement("video");
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;
    // Required for some browsers to populate dimensions before play().
    video.preload = "auto";

    // Wait for metadata so we know duration + intrinsic dimensions.
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            "Could not load the recorded video for frame extraction.",
          ),
        );
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(
        "Recorded video has no readable duration; can't sample frames.",
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Browser canvas 2D context unavailable.");
    }

    const frames: ExtractedFrame[] = [];
    const sampleTimes = computeSampleTimes(duration, FRAME_COUNT);

    for (const t of sampleTimes) {
      // Seeking can fail or arrive at a frame slightly off from `t`.
      // We trust the browser's nearest-keyframe seek; we don't need
      // millisecond accuracy for presence/eye-contact reads.
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      // toDataURL returns "data:image/jpeg;base64,XXXX" — split off the
      // prefix so we send only the base64 payload to the API. The Anthropic
      // SDK image block expects the raw base64, not a data URL.
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",", 2)[1] ?? "";
      frames.push({ base64, timestampSeconds: t });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Evenly-spaced sample times trimmed to the 5–95% window of the recording.
 * For a 60s clip with FRAME_COUNT=4, that yields roughly t=3, t=21, t=39, t=57.
 */
function computeSampleTimes(durationSeconds: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [durationSeconds * 0.5];
  const start = durationSeconds * SAMPLE_START_PCT;
  const end = durationSeconds * SAMPLE_END_PCT;
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/**
 * Promise wrapper around HTMLVideoElement seeking. The `seeked` event is the
 * only reliable signal that a frame is decoded and ready to draw — relying
 * on `currentTime` setter alone leads to blank canvases on Safari.
 */
function seekTo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Seek to ${timeSeconds.toFixed(2)}s failed.`));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    // Clamp into the valid range to avoid the seek silently failing at the
    // very end of the buffer.
    video.currentTime = Math.max(0, Math.min(timeSeconds, video.duration));
  });
}
