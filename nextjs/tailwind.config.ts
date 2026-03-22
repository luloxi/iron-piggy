/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FDF6EC",
        bark: "#2D1F1A",
        "bark-light": "#5C3D2E",
        clay: "#C25B4E",
        "clay-light": "#E8705A",
        "clay-pale": "#F5E0DC",
        sage: "#2D7D4E",
        "sage-pale": "#D4EDDF",
        warm: "#FFFBF7",
      },
      fontFamily: {
        display: ["Lora", "Georgia", "serif"],
        body: ["DM Sans", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "wobble": "wobble 0.6s ease-in-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(12px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        wobble: { "0%,100%": { transform: "rotate(0deg)" }, "25%": { transform: "rotate(-4deg)" }, "75%": { transform: "rotate(4deg)" } },
        pulseSoft: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.7" } },
      },
    },
  },
  plugins: [],
};
