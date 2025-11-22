/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#38bdf8",
          purple: "#6366f1",
        },
      },
      boxShadow: {
        "soft-glow": "0 18px 40px rgba(15, 23, 42, 0.9)",
      },
      borderRadius: {
        "xl2": "1rem",
      },
    },
  },
  plugins: [],
};
