export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#FF9F1C",
        "primary-dark": "#F97316",
        "primary-light": "#FFB703",
        "background-light": "#FFFDF9",
        "surface-light": "#FFFFFF",
        "surface-border": "#E4E4E7",
        "text-main": "#1e293b",
        "text-sub": "#94a3b8",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}
