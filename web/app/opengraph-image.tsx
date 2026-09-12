import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0d10",
          color: "#e8eaed",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: "#2fb96a" }} />
          <div style={{ fontSize: 40, fontWeight: 700 }}>Glucoalarm</div>
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, maxWidth: 980 }}>
          Glucose alerts that reach you before it&apos;s urgent.
        </div>
        <div style={{ fontSize: 28, color: "#9aa1ab", marginTop: 28, maxWidth: 900 }}>
          WhatsApp alerts and phone-call escalation, connected straight to your Dexcom.
        </div>
      </div>
    ),
    { ...size }
  );
}
