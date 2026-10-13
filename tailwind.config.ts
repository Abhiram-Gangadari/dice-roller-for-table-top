import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      animation: {
        shake: "shake 0.5s ease-in-out",
        pop: "pop 0.35s ease-out",
        glow: "glow 2s ease-in-out infinite"
      },
      keyframes: {
        shake: {
          "0%,100%": { transform: "rotate(0deg) scale(1)" },
          "25%": { transform: "rotate(-12deg) scale(1.08)" },
          "50%": { transform: "rotate(10deg) scale(1.12)" },
          "75%": { transform: "rotate(-6deg) scale(1.05)" }
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        glow: {
          "0%,100%": { boxShadow: "0 0 20px rgba(139,92,246,0.4)" },
          "50%": { boxShadow: "0 0 40px rgba(139,92,246,0.8)" }
        }
      }
    }
  },
  plugins: []
};
export default config;
