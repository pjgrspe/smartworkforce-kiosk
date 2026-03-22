import { useTheme } from '../../contexts/ThemeContext'

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-4 h-4">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M12.9 3.1l-1.4 1.4M4.5 11.5l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" stroke="none" className="w-4 h-4">
      <path d="M13.5 10.5A6.5 6.5 0 0 1 5.5 2.5a.5.5 0 0 0-.6-.6A6.5 6.5 0 1 0 14.1 11.1a.5.5 0 0 0-.6-.6z" />
    </svg>
  )
}

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`inline-flex items-center justify-center w-7 h-7 border border-navy-500 text-navy-200 hover:text-navy-50 hover:border-accent/50 transition-colors ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
