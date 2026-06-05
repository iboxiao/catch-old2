import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: "#17635f",
        ink: "#172026",
        paper: "#f7f3e8",
        brass: "#c58b39",
        coral: "#d95d4f",
      },
    },
  },
  plugins: [],
};

export default config;

