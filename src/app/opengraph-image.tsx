import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "CDRCheck - CDR Reconciliation Tool for VoIP Carriers";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "linear-gradient(to bottom right, #0a0a0a, #111111)",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Accent glow */}
        <div
          style={{
            position: "absolute",
            width: 800,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(52, 211, 153, 0.08) 0%, transparent 70%)",
          }}
        />

        {/* Logo icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 24,
            backgroundColor: "#0f0f0f",
            border: "2px solid rgba(52, 211, 153, 0.5)",
            marginBottom: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
            <div
              style={{
                width: 20,
                height: 50,
                backgroundColor: "#34d399",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: 20,
                height: 35,
                backgroundColor: "#34d399",
                opacity: 0.7,
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: 20,
                height: 60,
                backgroundColor: "#34d399",
                opacity: 0.5,
                borderRadius: 4,
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "white",
            marginBottom: 20,
          }}
        >
          CDR
          <span style={{ color: "#34d399" }}>Check</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "#888888",
            marginBottom: 40,
          }}
        >
          CDR Reconciliation for VoIP Carriers
        </div>

        {/* Features */}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#666666",
            gap: 20,
          }}
        >
          <span>Compare Records</span>
          <span>•</span>
          <span>Find Discrepancies</span>
          <span>•</span>
          <span>Free Tool</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
