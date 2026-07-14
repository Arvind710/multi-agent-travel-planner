import "./tokens.css";
import type { CSSProperties } from "react";
import { useState } from "react";

/**
 * P0 exit-gate story: full palette (light+dark), type ramp incl. Devanagari,
 * spacing scale. Run with `pnpm --filter @raah/ui ladle`.
 */
const semanticColors = [
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-sunken",
  "--color-ink",
  "--color-ink-muted",
  "--color-accent",
  "--color-secondary",
  "--color-warning",
  "--color-success",
  "--color-danger",
  "--color-border",
];

const wrap: CSSProperties = {
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  fontFamily: "var(--font-body)",
  padding: "var(--space-8)",
  minHeight: "100vh",
};

export const Tokens = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return (
    <div data-theme={theme} style={wrap}>
      <button
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        style={{
          border: "var(--border-hairline)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-2) var(--space-4)",
          background: "var(--color-surface-raised)",
          color: "var(--color-ink)",
          marginBottom: "var(--space-8)",
        }}
      >
        theme: {theme} — toggle
      </button>

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>Palette</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {semanticColors.map((v) => (
          <div key={v} style={{ width: 132 }}>
            <div
              style={{
                height: 48,
                background: `var(${v})`,
                border: "var(--border-hairline)",
                borderRadius: "var(--radius-sm)",
              }}
            />
            <code style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>{v}</code>
          </div>
        ))}
      </div>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          marginTop: "var(--space-10)",
        }}
      >
        Type ramp
      </h2>
      {(
        ["--text-4xl", "--text-2xl", "--text-xl", "--text-doc", "--text-ui", "--text-sm"] as const
      ).map((v) => (
        <p key={v} style={{ fontSize: `var(${v})`, margin: "var(--space-2) 0" }}>
          <span style={{ fontFamily: "var(--font-display)" }}>Udaipur before the crowds — </span>
          <span>यात्रा शुरू होती है</span>{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{v}</code>
        </p>
      ))}
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
        Train 12958 · PNR 4521-8765-33 · 2A
      </p>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          marginTop: "var(--space-10)",
        }}
      >
        Spacing (4px grid)
      </h2>
      {[1, 2, 3, 4, 6, 8, 12, 16].map((s) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <code style={{ width: 90, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
            --space-{s}
          </code>
          <div
            style={{ height: 12, width: `var(--space-${s})`, background: "var(--color-accent)" }}
          />
        </div>
      ))}
    </div>
  );
};

Tokens.storyName = "Design Tokens";
