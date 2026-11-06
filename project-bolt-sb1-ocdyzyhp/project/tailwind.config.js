/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      colors: {
        leaf: {
          50: '#f2f7f0',
          100: '#e1eddc',
          200: '#c4dbb9',
          300: '#9dc08c',
          400: '#74a262',
          500: '#548447',
          600: '#42693a',
          700: '#35542f',
          800: '#2b4427',
          900: '#22361f',
          950: '#121f10',
        },
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
