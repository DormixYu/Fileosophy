/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gold: {
          50: "#FFF9E6",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#D4A840",
          500: "#C49B51",
          600: "#B08A3E",
          700: "#9B7428",
          800: "#7A5C20",
          900: "#5A4318",
        },
        warm: {
          50: "#FFF8F0",
          100: "#FFE4C4",
          200: "#FFD1A3",
          300: "#F4A460",
          400: "#E8924A",
          500: "#F4A460",
          600: "#D08030",
          700: "#B06820",
        },
        parchment: {
          50: "#F6F1E6",
          100: "#EAE3D2",
          200: "#D4C9B2",
          300: "#B8B2A6",
        },
        void: {
          DEFAULT: "#16120E",
          50: "#2E2820",
          100: "#221D17",
        },
        surface: {
          DEFAULT: "#F6F1E6",
          alt: "#EAE3D2",
          elevated: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#1E1A14",
          secondary: "#4A4338",
          tertiary: "#7A7160",
          muted: "#7A7368",
        },
      },
      fontFamily: {
        sans: ["DM Mono", "Inter", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Playfair Display", "Georgia", "serif"],
        mono: ["DM Mono", "monospace"],
      },
      fontSize: {
        headline: ["2rem", { lineHeight: "1.2", fontWeight: "300" }],
        title: ["1.5rem", { lineHeight: "1.3", fontWeight: "300" }],
        body: ["0.875rem", { lineHeight: "1.6", fontWeight: "300" }],
        callout: ["0.8125rem", { lineHeight: "1.5", fontWeight: "300" }],
        subhead: ["0.75rem", { lineHeight: "1.5", fontWeight: "300" }],
        footnote: ["0.6875rem", { lineHeight: "1.4", fontWeight: "300" }],
        caption: ["0.625rem", { lineHeight: "1.4", fontWeight: "300" }],
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "20px",
        xl: "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 4px 12px rgba(0, 0, 0, 0.06)",
        lg: "0 8px 40px rgba(0, 0, 0, 0.55)",
        xl: "0 16px 48px rgba(0, 0, 0, 0.10)",
        gold: "0 4px 20px rgba(196, 155, 81, 0.15)",
        "gold-lg": "0 8px 32px rgba(196, 155, 81, 0.18)",
      },
      animation: {
        "slide-up": "slide-up 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
