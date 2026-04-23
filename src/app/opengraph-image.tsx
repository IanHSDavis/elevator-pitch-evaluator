import { ImageResponse } from "next/og";

export const alt =
  "Elevator Pitch Evaluator — record a pitch, get coaching against a five-dimension rubric.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Paper-and-ink palette (hex approximations of the app's OKLCH tokens —
// Satori doesn't reliably support OKLCH yet).
const BG = "#F5F1E8";
const INK = "#2A251E";
const INK_DIM = "#5C544A";
const INK_FAINT = "#B3ABA0";
const LINE_SOFT = "#DED7C8";

async function loadGoogleFont(
  family: string,
  weight: number,
  italic = false,
): Promise<ArrayBuffer> {
  const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:${axis}&display=swap`;
  const cssRes = await fetch(cssUrl, {
    // Pretend to be a browser that needs truetype/woff2. The response varies
    // by User-Agent; with no UA, Google returns woff2 which Satori can read.
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const css = await cssRes.text();
  const match = css.match(/src: url\((.+?)\) format/);
  if (!match) throw new Error(`Font lookup failed for ${family}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export default async function Image() {
  const [serif, serifItalic, mono500, interTight300, interTight500] =
    await Promise.all([
      loadGoogleFont("Instrument+Serif", 400),
      loadGoogleFont("Instrument+Serif", 400, true),
      loadGoogleFont("JetBrains+Mono", 500),
      loadGoogleFont("Inter+Tight", 300),
      loadGoogleFont("Inter+Tight", 500),
    ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: BG,
          color: INK,
          padding: "56px 72px",
          fontFamily: "Inter Tight",
        }}
      >
        {/* Top brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: "JetBrains Mono",
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: INK_DIM,
          }}
        >
          <span>Elevator / Pitch / Evaluator</span>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            background: LINE_SOFT,
            marginTop: 20,
          }}
        />

        {/* Hero + meta */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flex: 1,
            paddingTop: 40,
            paddingBottom: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Instrument Serif",
              fontSize: 150,
              lineHeight: 0.95,
              letterSpacing: "-0.025em",
              color: INK,
            }}
          >
            <span style={{ display: "flex" }}>Say it</span>
            <span style={{ display: "flex" }}>
              in&nbsp;
              <span
                style={{
                  display: "flex",
                  fontStyle: "italic",
                  color: INK_DIM,
                }}
              >
                sixty
              </span>
            </span>
            <span style={{ display: "flex" }}>seconds.</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "JetBrains Mono",
              fontSize: 20,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: INK_FAINT,
              lineHeight: 1.9,
              textAlign: "right",
              alignItems: "flex-end",
            }}
          >
            <span>Target 60–90s</span>
            <span>Whisper · transcribe</span>
            <span>Claude · evaluate</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            background: LINE_SOFT,
            marginBottom: 20,
          }}
        />

        {/* Footer row: lede + URL */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: INK_DIM,
              fontWeight: 300,
              maxWidth: 720,
            }}
          >
            Record a pitch. Get blunt coaching — no cheerleading.
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "JetBrains Mono",
              fontSize: 15,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: INK_FAINT,
              fontWeight: 500,
            }}
          >
            elevator-pitch-evaluator.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Instrument Serif",
          data: serif,
          style: "normal",
          weight: 400,
        },
        {
          name: "Instrument Serif",
          data: serifItalic,
          style: "italic",
          weight: 400,
        },
        {
          name: "JetBrains Mono",
          data: mono500,
          style: "normal",
          weight: 500,
        },
        {
          name: "Inter Tight",
          data: interTight300,
          style: "normal",
          weight: 300,
        },
        {
          name: "Inter Tight",
          data: interTight500,
          style: "normal",
          weight: 500,
        },
      ],
    },
  );
}
