/**
 * Badge — compact status / label chip.
 * Follows the design system: monochromatic, uppercase, no soft pastels.
 */

const VARIANTS = {
  // Employment / general status
  active:           'bg-signal-success/10 text-signal-success  border-signal-success/25',
  inactive:         'bg-navy-500/20       text-navy-200         border-navy-500/30',
  resigned:         'bg-signal-warning/10 text-signal-warning   border-signal-warning/25',
  terminated:       'bg-signal-danger/10  text-signal-danger    border-signal-danger/25',
  // Semantic aliases
  success:          'bg-signal-success/10 text-signal-success  border-signal-success/25',
  warning:          'bg-signal-warning/10 text-signal-warning  border-signal-warning/25',
  danger:           'bg-signal-danger/10  text-signal-danger   border-signal-danger/25',
  info:             'bg-signal-info/10    text-signal-info     border-signal-info/25',
  blue:             'bg-accent/10         text-accent-400      border-accent/25',
  neutral:          'bg-navy-500/20       text-navy-200        border-navy-500/30',
  // Payroll statuses
  finalized:        'bg-signal-success/10 text-signal-success  border-signal-success/25',
  approved:         'bg-accent/10         text-accent-400      border-accent/25',
  pending_approval: 'bg-signal-warning/10 text-signal-warning  border-signal-warning/25',
  draft:            'bg-navy-500/20       text-navy-200        border-navy-500/30',
  computed:         'bg-signal-info/10    text-signal-info     border-signal-info/25',
  // Punch type
  IN:               'bg-signal-success/10 text-signal-success  border-signal-success/25',
  OUT:              'bg-signal-danger/10  text-signal-danger   border-signal-danger/25',
  BREAK:            'bg-signal-warning/10 text-signal-warning  border-signal-warning/25',
}

export default function Badge({ variant = 'neutral', children, className = '' }) {
  const cls = VARIANTS[variant] ?? VARIANTS.neutral
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-semibold
                  uppercase tracking-wider border rounded-md ${cls} ${className}`}
    >
      {children}
    </span>
  )
}
