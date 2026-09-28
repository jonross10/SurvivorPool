import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      // Semantic tokens → CSS variables (see globals.css). Keeps components
      // theme-agnostic: bg-surface / text-fg / border-line etc.
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        "success-fg": "var(--success-fg)",
        "success-soft": "var(--success-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        warn: "var(--warn)",
        "warn-soft": "var(--warn-soft)",
        info: "var(--info)",
        "info-soft": "var(--info-soft)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15,27,51,.04), 0 8px 24px -16px rgba(15,27,51,.25)",
        glow: "0 4px 14px -4px rgba(37,99,235,.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
