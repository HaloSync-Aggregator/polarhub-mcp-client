import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    `${__dirname}/index.html`,
    `${__dirname}/src/**/*.{js,ts,jsx,tsx}`,
  ],
  theme: {
    extend: {
      colors: {
        halo: {
          purple: '#6442d6',
          'purple-hover': '#5638bd',
          'purple-light': '#f3f0fc',
          'purple-dark': '#4a2fb0',
          green: '#21a35d',
          'green-hover': '#1c8c50',
          'green-light': '#e8f7ef',
          magenta: '#d14984',
          'magenta-hover': '#bc3d73',
          'magenta-light': '#fdf0f5',
        },
        bg: {
          primary: '#FFFFFF',
          secondary: '#F9FAFB',
          tertiary: '#F3F4F6',
          chat: '#FAFAFA',
          sidebar: '#F7F7F8',
          hover: '#EFEFEF',
          dark: '#030711',
        },
        text: {
          primary: '#1F2937',
          secondary: '#6B7280',
          muted: '#9CA3AF',
          inverse: '#FFFFFF',
        },
        border: {
          light: '#E5E7EB',
          medium: '#D1D5DB',
          dark: '#9CA3AF',
        },
        status: {
          success: '#21a35d',
          'success-light': '#e8f7ef',
          warning: '#F59E0B',
          'warning-light': '#FEF3C7',
          error: '#dc362e',
          'error-light': '#FEE2E2',
          info: '#6442d6',
          'info-light': '#f3f0fc',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '22px',
        'full': '64px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 8px 40px -8px rgba(0, 0, 0, 0.22)',
        'float': '0 8px 40px -8px rgba(0, 0, 0, 0.22)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      backdropBlur: {
        'card': '16px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
