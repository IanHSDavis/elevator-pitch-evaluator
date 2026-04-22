// Demo fixture used when the user clicks "Try a demo pitch" on the landing page.
// The client sends this directly to /api/evaluate — no audio / Whisper involved.
export const DEMO_PITCH = {
  transcript:
    "Hi, I'm Jordan, and I run a small SaaS company called TrackTide. Most companies struggle to understand their customer churn — they see numbers go up and down but can't really figure out why. We built a platform that connects to your CRM and customer success tools and tells you in plain language which customers are at risk and why. It's helped our customers reduce churn by about 20% on average. Would love to grab 15 minutes next week to show you how it could work for your team.",
  durationSeconds: 55,
};
