/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#F5F8F2",
        card: "#FFFFFF",
        soft: "#EEF4E9",
        ink: "#18231D",
        muted: "#617068",
        line: "#D5E1D0",
        sage: "#3D695C",
        moss: "#D3E9A4",
        mint: "#BED6C8",
        danger: "#A35A4F"
      },
      boxShadow: {
        panel: "0 18px 40px rgba(61, 105, 92, 0.14)"
      },
      borderRadius: {
        "4xl": "32px"
      }
    }
  },
  plugins: []
};
