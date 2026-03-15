/**
 * Button — design-system button with variant, size, and loading state.
 * Primary (accent) variant is reserved for top-level CTAs only.
 */

const VARIANTS = {
  primary:   'bg-accent hover:bg-accent-400 text-white border-transparent',
  secondary: 'bg-navy-600 hover:bg-navy-500 text-navy-100 border-navy-500 hover:border-navy-400',
  ghost:     'bg-transparent hover:bg-navy-700 text-navy-200 border-transparent hover:text-navy-50',
  danger:    'bg-transparent hover:bg-signal-danger/10 text-signal-danger border-transparent',
  outline:   'bg-transparent hover:bg-navy-700 text-navy-200 border-navy-500 hover:border-navy-400',
}

const SIZES = {
  xs: 'h-6 px-2.5 text-2xs gap-1',
  sm: 'h-7 px-3   text-xs  gap-1.5',
  md: 'h-8 px-4   text-sm  gap-2',
  lg: 'h-10 px-5  text-sm  gap-2',
}

export default function Button({
  variant  = 'secondary',
  size     = 'md',
  disabled = false,
  loading  = false,
  type     = 'button',
  className = '',
  children,
  ...props
}) {
  const v = VARIANTS[variant] ?? VARIANTS.secondary
  const s = SIZES[size]       ?? SIZES.md

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium border
        transition-colors duration-80 rounded-md
        focus-visible:ring-2 focus-visible:ring-accent/60
        focus-visible:ring-offset-2 focus-visible:ring-offset-navy-800
        disabled:opacity-40 disabled:cursor-not-allowed
        ${v} ${s} ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{children}</span>
        </>
      ) : children}
    </button>
  )
}
