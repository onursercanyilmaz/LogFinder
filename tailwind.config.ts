import type { Config } from "tailwindcss";

// kibana.* renkleri CSS değişkenlerinden gelir → data-theme değişince
// hiçbir class değişmeden tema değişir (opacity modifier'lar da çalışır).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kibana: {
          bg: "rgb(var(--kb-bg) / <alpha-value>)",
          panel: "rgb(var(--kb-panel) / <alpha-value>)",
          panel2: "rgb(var(--kb-panel2) / <alpha-value>)",
          border: "rgb(var(--kb-border) / <alpha-value>)",
          text: "rgb(var(--kb-text) / <alpha-value>)",
          muted: "rgb(var(--kb-muted) / <alpha-value>)",
          accent: "rgb(var(--kb-accent) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
