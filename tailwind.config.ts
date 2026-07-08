import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0f1c",
        surface: "#111827",
        surface2: "#1b2436",
        line: "#273244",
        line2: "#334155",
        muted: "#94a3b8",
        dim: "#6b7280",
        accent: {
          DEFAULT: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        teal: {
          DEFAULT: "#14b8a6",
          600: "#0d9488",
        },
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(99,102,241,0.25), 0 0 24px -8px rgba(99,102,241,0.35)",
        "glow-teal": "0 0 0 1px rgba(20,184,166,0.25), 0 0 24px -8px rgba(20,184,166,0.3)",
      },
      backgroundImage: {
        "gradient-title": "linear-gradient(90deg, #c7d2fe, #93c5fd, #5eead4)",
      },
    },
  },
  plugins: [],
};

export default config;
