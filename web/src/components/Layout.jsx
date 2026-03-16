/**
 * Layout — Sidebar navigation + main content wrapper.
 * Implements the "Executive Minimalism" design language:
 *   - SVG icons, no emojis
 *   - Swiss-grid sidebar with category labels
 *   - Snappy hover states with a left-border active indicator
 *   - Live WS / sync status in the footer
 */

import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../contexts/WebSocketContext'
import ThemeToggle from './ui/ThemeToggle'
import logo from '../img/delogo-2022.png'

// ── Inline SVG icon set ──────────────────────────────────────────────
const Icons = {
  Dashboard: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <rect x="1" y="1" width="6" height="6" rx="0.5" /><rect x="9" y="1" width="6" height="6" rx="0.5" />
      <rect x="1" y="9" width="6" height="6" rx="0.5" /><rect x="9" y="9" width="6" height="6" rx="0.5" />
    </svg>
  ),
  Employees: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-2.76 2.239-5 5-5s5 2.24 5 5" />
      <path d="M11.5 7a2 2 0 100-4" /><path d="M14.5 14c0-1.93-1.34-3.56-3.15-3.93" />
    </svg>
  ),
  Branches: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <path d="M1 14h14M3 14V7l5-4 5 4v7" /><rect x="6" y="10" width="4" height="4" />
    </svg>
  ),
  Schedules: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <rect x="1" y="3" width="14" height="12" rx="0.5" /><path d="M1 7h14M5 1v4M11 1v4" />
      <path d="M4 10h2M7 10h2M10 10h2M4 13h2M7 13h2" />
    </svg>
  ),
  Attendance: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v3.75L10.5 10" />
    </svg>
  ),
  Corrections: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <path d="M2 13.5L10 5.5l3 3-8 8H2v-3z" /><path d="M8.5 7l3 3" />
    </svg>
  ),
  PayrollSettings: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" />
    </svg>
  ),
  PayrollRuns: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <rect x="1" y="2" width="14" height="13" rx="0.5" /><path d="M1 6h14M4.5 1v2.5M11.5 1v2.5M4 10h3M4 13h5M11 10l1.5 1.5L15 8" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <circle cx="8" cy="5" r="3" /><path d="M2 14.5c0-3.038 2.686-5.5 6-5.5s6 2.462 6 5.5" />
    </svg>
  ),
  Profile: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <circle cx="8" cy="5" r="3" /><path d="M3 14.5c0-2.76 2.24-5 5-5s5 2.24 5 5" />
      <path d="M1.5 8.5h2.5M1.5 11h2.5" />
    </svg>
  ),
  SignOut: () => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[15px] h-[15px] shrink-0">
      <path d="M6 2.5H2.5A1.5 1.5 0 001 4v8a1.5 1.5 0 001.5 1.5H6M10.5 11.5l4-4-4-4M14.5 7.5H6" />
    </svg>
  ),
}

// ── Navigation structure ─────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', Icon: Icons.Dashboard, roles: null },
    ],
  },
  {
    label: 'Workforce',
    items: [
      { to: '/employees', label: 'Employees', Icon: Icons.Employees, roles: ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager', 'auditor'] },
      { to: '/branches',  label: 'Branches',  Icon: Icons.Branches,  roles: ['super_admin', 'client_admin'] },
      { to: '/schedules', label: 'Schedules', Icon: Icons.Schedules, roles: ['super_admin', 'client_admin', 'hr_payroll'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/attendance',  label: 'Attendance',  Icon: Icons.Attendance,  roles: ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager', 'auditor'] },
      { to: '/corrections', label: 'Corrections', Icon: Icons.Corrections, roles: ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager', 'auditor'] },
    ],
  },
  {
    label: 'Payroll',
    items: [
      { to: '/payroll/settings', label: 'Settings', Icon: Icons.PayrollSettings, roles: ['super_admin', 'client_admin', 'hr_payroll'] },
      { to: '/payroll/runs',     label: 'Runs',     Icon: Icons.PayrollRuns,     roles: ['super_admin', 'client_admin', 'hr_payroll', 'auditor'] },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/profile', label: 'Profile', Icon: Icons.Profile, roles: null },
      { to: '/users', label: 'Users', Icon: Icons.Users, roles: ['super_admin', 'client_admin'] },
    ],
  },
]

// ── Component ────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { user, signOut } = useAuth()
  const { isConnected, syncStatus } = useWebSocket()

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || item.roles.includes(user?.role)),
    }))
    .filter(g => g.items.length > 0)

  const roleLabel = user?.role?.replace(/_/g, ' ').toUpperCase() ?? ''
  const avatarInitials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'

  return (
    <div className="flex min-h-screen bg-navy-900">
      {/* ━━ Sidebar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <aside className="w-[220px] shrink-0 flex flex-col bg-navy-800 border-r border-navy-500/40">

        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-navy-500/30">
          <div className="flex items-center gap-2">
            <img src={logo} alt="DE WEBNET" className="h-7 w-auto" />
            <span className="text-2xs text-navy-300 font-mono">v2.0</span>
          </div>
          <p className="text-xs text-navy-400 uppercase tracking-[0.12em] mt-1.5 font-medium">
            HR &amp; Payroll Platform
          </p>
        </div>

        {/* Authenticated user chip */}
        <div className="px-4 py-3 border-b border-navy-500/20">
          <NavLink
            to="/profile"
            className={({ isActive }) => `block rounded-lg border px-3 py-2.5 transition-colors duration-80 ${
              isActive
                ? 'border-accent/40 bg-accent/10'
                : 'border-navy-500/40 bg-navy-700/25 hover:bg-navy-700/45'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.profilePictureUrl ? (
                <img
                  src={user.profilePictureUrl}
                  alt="Profile"
                  className="w-9 h-9 rounded-lg object-cover border border-navy-500/70 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-500/70 text-navy-100 text-xs font-semibold flex items-center justify-center shrink-0">
                  {avatarInitials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-navy-100 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-navy-500/30">
              <span className="inline-flex px-1.5 py-px text-xs font-semibold uppercase tracking-wider bg-accent/10 text-accent-400 border border-accent/20 rounded-md">
                {roleLabel}
              </span>
            </div>
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-5">
          {visibleGroups.map(group => (
            <div key={group.label}>
              <p className="label-caps px-5 mb-1">{group.label}</p>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `
                    relative flex items-center gap-2.5 px-5 py-[7px] text-[13px] font-medium
                    transition-colors duration-80
                    ${isActive
                      ? 'text-navy-50 bg-brand-green/8 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-brand-green'
                      : 'text-navy-200 hover:text-navy-50 hover:bg-navy-700/40'
                    }
                  `}
                >
                  <item.Icon />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer: status + sign-out */}
        <div className="px-5 py-4 border-t border-navy-500/30 space-y-3">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <span className="label-caps">Theme</span>
            <ThemeToggle />
          </div>

          {/* WebSocket connection */}
          <div className="flex items-center justify-between">
            <span className="label-caps">WS</span>
            <div className={`flex items-center gap-1.5 text-2xs font-semibold tabular
                            ${isConnected ? 'text-signal-success' : 'text-navy-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0
                               ${isConnected ? 'bg-signal-success' : 'bg-navy-500'}`} />
              {isConnected ? 'CONNECTED' : 'OFFLINE'}
            </div>
          </div>

          {/* Pending sync */}
          {syncStatus?.pending_sync_count > 0 && (
            <p className="text-2xs text-signal-warning font-mono">
              {syncStatus.pending_sync_count} pending sync
            </p>
          )}

          {/* Sign out */}
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full text-[13px] font-medium
                       text-navy-300 hover:text-signal-danger transition-colors duration-80"
          >
            <Icons.SignOut />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ━━ Main content ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <main className="flex-1 min-w-0 flex flex-col overflow-auto bg-navy-900">
        {children}
      </main>
    </div>
  )
}

