import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Bridge prototype OKLCH tokens (in src/styles/globals.css :root) to Tailwind
// color utilities. Keeping token names 1:1 with the prototype so refactors
// stay traceable back to OmniDash.html :root.
//
// SOURCE: Claude Design prototype OmniDash.html lines 12-67 (regular theme).

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Prototype tokens wired as Tailwind semantic names.
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        sidebar: "var(--sidebar)",
        "sidebar-ink": "var(--sidebar-ink)",
        "sidebar-ink-2": "var(--sidebar-ink-2)",
        "sidebar-line": "var(--sidebar-line)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        "status-ok": "var(--status-ok)",
        "status-warn": "var(--status-warn)",
        "status-bad": "var(--status-bad)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Helvetica", "Arial", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        "pad-y": "var(--pad-y)",
        "pad-x": "var(--pad-x)",
        "row-gap": "var(--row-gap)",
      },
    },
  },
  plugins: [animate],
};

export default config;
