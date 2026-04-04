import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kiosk: {
          background: '#0a0a0a',
          surface: '#1a1a1a',
          primary: '#6366f1',
          'primary-hover': '#818cf8',
          text: '#fafafa',
          'text-muted': '#a1a1aa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
