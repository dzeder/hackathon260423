import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ohfy: {
          slate: "#0f172a",
          accent: "#22c55e",
          warn: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
