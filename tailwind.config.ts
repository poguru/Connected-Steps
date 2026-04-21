import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        body:    ["var(--font-dm-sans)", "sans-serif"],
      },
      colors: {
        cs: {
          black:         "#0a0a0a",
          dark:          "#111111",
          charcoal:      "#1a1a1a",
          orange:        "#e8620a",
          "orange-light":"#ff7a24",
          white:         "#ffffff",
          "off-white":   "#f0f0f0",
          muted:         "#888888",
        },
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
