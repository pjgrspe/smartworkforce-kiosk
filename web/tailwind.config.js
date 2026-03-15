/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Deep Navy System Palette ──────────────────────────────
        navy: {
          950: 'rgb(var(--c-navy-950) / <alpha-value>)',
          900: 'rgb(var(--c-navy-900) / <alpha-value>)',
          800: 'rgb(var(--c-navy-800) / <alpha-value>)',
          700: 'rgb(var(--c-navy-700) / <alpha-value>)',
          600: 'rgb(var(--c-navy-600) / <alpha-value>)',
          500: 'rgb(var(--c-navy-500) / <alpha-value>)',
          400: 'rgb(var(--c-navy-400) / <alpha-value>)',
          300: 'rgb(var(--c-navy-300) / <alpha-value>)',
          200: 'rgb(var(--c-navy-200) / <alpha-value>)',
          100: 'rgb(var(--c-navy-100) / <alpha-value>)',
          50:  'rgb(var(--c-navy-50) / <alpha-value>)',
        },
        // ── Accent — used ONLY for primary CTAs ───────────────────
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          50:  'rgb(var(--c-accent-50) / <alpha-value>)',
          100: 'rgb(var(--c-accent-100) / <alpha-value>)',
          200: 'rgb(var(--c-accent-200) / <alpha-value>)',
          400: 'rgb(var(--c-accent-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent-600) / <alpha-value>)',
          700: 'rgb(var(--c-accent-700) / <alpha-value>)',
          muted:  'rgb(var(--c-accent-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-accent-subtle) / <alpha-value>)',
        },
        // ── Signal colors ─────────────────────────────────────────
        signal: {
          success: 'rgb(var(--c-signal-success) / <alpha-value>)',
          warning: 'rgb(var(--c-signal-warning) / <alpha-value>)',
          danger:  'rgb(var(--c-signal-danger) / <alpha-value>)',
          info:    'rgb(var(--c-signal-info) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
      },
      animation: {
        'fade-in':    'fadeIn 0.12s ease-out',
        'slide-down': 'slideDown 0.15s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      transitionDuration: {
        '80':  '80ms',
        '120': '120ms',
      },
      transitionTimingFunction: {
        'snap': 'cubic-bezier(0.25, 0, 0, 1)',
      },
    },
  },
  plugins: [],
}
