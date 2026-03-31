/**
 * Form inputs — Input, Textarea, Select.
 * All share field-base from index.css.
 */

const fieldCls = `
  w-full h-9 px-3 text-sm
  bg-navy-600 border border-navy-500 text-navy-100
  placeholder:text-navy-300/40
  focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30
  transition-colors duration-80 rounded-md
  focus:outline-none
`

const errorCls = 'border-signal-danger focus-visible:border-signal-danger focus-visible:ring-signal-danger/30'

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="label-caps">{label}</label>}
      <input
        className={`${fieldCls} ${error ? errorCls : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-2xs text-signal-danger">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', rows = 3, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="label-caps">{label}</label>}
      <textarea
        rows={rows}
        className={`
          w-full px-3 py-2 text-sm
          bg-navy-600 border border-navy-500 text-navy-100
          placeholder:text-navy-300/40
          focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30
          transition-colors duration-80 rounded-md resize-none focus:outline-none
          ${error ? errorCls : ''} ${className}
        `}
        {...props}
      />
      {error && <p className="text-2xs text-signal-danger">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="label-caps">{label}</label>}
      <select
        className={`${fieldCls} ${error ? errorCls : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-2xs text-signal-danger">{error}</p>}
    </div>
  )
}
