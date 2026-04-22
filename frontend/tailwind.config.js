/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#F4F7FB",
        card: "#FFFFFF",
        soft: "#F8FAFD",
        ink: "#101828",
        muted: "#667085",
        line: "rgba(15, 23, 42, 0.06)",
        sage: "#1F6F66",
        moss: "#E6F4F1",
        mint: "#EAF0F6",
        danger: "#C25747"
      },
      boxShadow: {
        panel: "0 18px 40px rgba(31, 111, 102, 0.12)"
      },
      borderRadius: {
        "4xl": "32px"
      }
    }
  },
  plugins: []
};
