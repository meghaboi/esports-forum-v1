import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#15191d",
        surface: "#1f242c",
        border: "#2a3038",
        foreground: "#e6edf3",
        muted: "#9aa4af",
        accent: {
          green: "#00ff85",
          red: "#ff4655",
          yellow: "#ffb000",
        },
      },
    },
  },
  plugins: [],
};
export default config;
