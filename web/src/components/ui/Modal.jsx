/**
 * Modal — keyboard-accessible overlay dialog.
 * Closes on Escape. Scrollable body.
 */

import { useEffect } from 'react'
import Button from './Button'

export default function Modal({
  title,
  subtitle,
  onClose,
  onConfirm,
  confirmLabel   = 'Save',
  confirmVariant = 'primary',
  loading        = false,
  width          = 'max-w-2xl',
  children,
}) {
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-navy-950/80 backdrop-blur-[2px] pt-10 pb-10 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={`relative w-full ${width} mx-4 bg-navy-700 border border-navy-500
                    shadow-[0_24px_64px_rgba(3,7,13,0.8)] rounded-md animate-slide-down`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-navy-500">
          <div>
            <h3 className="text-sm font-semibold text-navy-50">{title}</h3>
            {subtitle && <p className="text-xs text-navy-300 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-navy-400 hover:text-navy-100 transition-colors ml-4 mt-0.5
                       text-xl leading-none focus:outline-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-2 border-t border-navy-500/50">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {onConfirm && (
            <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
