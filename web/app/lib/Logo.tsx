const GRADIENT_ID = "glucoalarm-droplet-gradient";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5ec8f8" />
          <stop offset="100%" stopColor="#1b6fb8" />
        </linearGradient>
      </defs>
      <path
        d="M50,6 C50,6 18,46 18,66 A32,32 0 1,0 82,66 C82,46 50,6 50,6 Z"
        fill={`url(#${GRADIENT_ID})`}
      />
      <path
        d="M38,52 A20,20 0 0,1 66,52"
        fill="none"
        stroke="#2fb96a"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M43,60 A12,12 0 0,1 61,60"
        fill="none"
        stroke="#2fb96a"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="52" cy="68" r="6" fill="#2fb96a" />
    </svg>
  );
}

export function Logo({ withTagline = false, size = 28 }: { withTagline?: boolean; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", lineHeight: 1 }}>
      <LogoMark size={size} />
      <span style={{ display: "inline-flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700, fontSize: size * 0.64, letterSpacing: "-0.01em" }}>
          <span style={{ color: "#eaf3fb" }}>Gluco</span>
          <span style={{ color: "#5ec8f8" }}>alarm</span>
        </span>
        {withTagline && (
          <span
            style={{
              fontSize: size * 0.19,
              letterSpacing: "0.16em",
              color: "var(--text-dim)",
              fontWeight: 500,
              marginTop: "0.15rem",
            }}
          >
            GLUCOSE ALARM MONITOR
          </span>
        )}
      </span>
    </span>
  );
}
