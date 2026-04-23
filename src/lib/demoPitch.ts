// Demo fixtures used by the landing page's "Try a demo pitch" selector.
// The client sends these directly to /api/evaluate — no audio / Whisper involved.
//
// These are also the fixtures used by the calibration generalization study.
// They're intentionally written to land in different rubric bands so that
// (a) visitors can compare what scoring looks like across pitch quality, and
// (b) the calibration work can be verified to generalize beyond any single
// pitch it was tuned against.

export type DemoPitchId = "weak" | "generic" | "strong";

export type DemoPitch = {
  id: DemoPitchId;
  label: string;
  blurb: string;
  transcript: string;
  durationSeconds: number;
};

export const DEMO_PITCHES: DemoPitch[] = [
  {
    id: "weak",
    label: "weak",
    blurb: "No identity, no problem, feature dump, vague close.",
    transcript:
      "Hey so uh we're building this AI platform. It's really innovative and leverages cutting-edge technology. It can do basically anything you need — we have customers in healthcare, finance, retail, you name it. The UI is beautiful and it's really easy to use. We just had a big launch and our traction is great. Anyway, I think you'd like it, you should check it out.",
    durationSeconds: 28,
  },
  {
    id: "generic",
    label: "mid",
    blurb: "Clean structure, generic framing. The original demo pitch.",
    transcript:
      "Hi, I'm Jordan, and I run a small SaaS company called TrackTide. Most companies struggle to understand their customer churn — they see numbers go up and down but can't really figure out why. We built a platform that connects to your CRM and customer success tools and tells you in plain language which customers are at risk and why. It's helped our customers reduce churn by about 20% on average. Would love to grab 15 minutes next week to show you how it could work for your team.",
    durationSeconds: 55,
  },
  {
    id: "strong",
    label: "strong",
    blurb: "Specific identity, anchored problem, outcome + proof, targeted close.",
    transcript:
      "I'm Maya, founder of Lintel — the compliance wedge for mid-market fintechs preparing their first SOC 2. Most CFOs at growth-stage fintechs spend six weeks chasing engineers for audit evidence while their runway burns; the audit slips by a quarter and their Series B timeline slips with it. Lintel auto-collects evidence from your cloud stack, maps it to the audit controls, and flags gaps before the auditor does — we've cut time-to-audit-ready from eight weeks to ten days with our first twelve customers. I know your team just closed a B round and compliance prep is on next quarter's plan. Can I grab twenty minutes Thursday or Friday to walk your team through a live demo?",
    durationSeconds: 62,
  },
];

export function getDemoPitch(id: DemoPitchId): DemoPitch {
  const pitch = DEMO_PITCHES.find((p) => p.id === id);
  if (!pitch) throw new Error(`Unknown demo pitch id: ${id}`);
  return pitch;
}

// Backward-compat: the single-pitch export used before the selector existed.
// Points at the mid-tier "generic" pitch.
export const DEMO_PITCH = getDemoPitch("generic");
