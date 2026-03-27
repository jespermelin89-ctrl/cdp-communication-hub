import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EBF5FF',
          100: '#D6EBFF',
          200: '#A3D1FF',
          300: '#70B7FF',
          400: '#3D9DFF',
          500: '#1A73E8',
          600: '#155BBB',
          700: '#10448E',
          800: '#0B2D61',
          900: '#061634',
        },
        priority: {
          high: '#DC2626',
          medium: '#F59E0B',
          low: '#10B981',
        },
        status: {
          pending: '#F59E0B',
          approved: '#3B82F6',
          sent: '#10B981',
          failed: '#DC2626',
          discarded: '#6B7280',
        },
      },
    },
  },
  plugins: [],
};

export default config;
