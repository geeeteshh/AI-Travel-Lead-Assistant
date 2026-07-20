/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#D96B43', // Terracotta
          light: '#FBECE6',
          hover: '#C25A33',
        },
        cream: {
          light: '#FFFFFF',   // Make cards white again
          DEFAULT: '#FAF8F5', // Original Soft Cream
          dark: '#F3EFEA',    // Original Warm Gray
          sage: '#EAEFE9',    // Original Soft Sage
        },
        coral: {
          DEFAULT: '#E05D5D', // Muted Coral
        }
      }
    },
  },
  plugins: [],
}
