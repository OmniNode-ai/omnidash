import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * SOURCE: Claude Design prototype OmniDash.html:12-67 (tokens).
 *
 * Exposes two parallel color vocabularies, both resolving to the same
 * underlying OKLCH values via the alias layer in src/styles/globals.css:
 *
 *   1. Prototype-flavored (bg, panel, ink, line, brand, status-*).
 *      Used when porting prototype code closely.
 *   2. Shadcn-flavored (background, foreground, card, popover, primary,
 *      secondary, muted, accent, destructive, border, input, ring).
 *      Used by shadcn/ui generated components.
 */

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Prototype tokens
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          ink: "var(--sidebar-ink)",
          "ink-2": "var(--sidebar-ink-2)",
          line: "var(--sidebar-line)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          soft: "var(--brand-soft)",
          ink: "var(--brand-ink)",
        },
        status: {
          ok: "var(--status-ok)",
          warn: "var(--status-warn)",
          bad: "var(--status-bad)",
        },

        // Shadcn tokens
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
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
