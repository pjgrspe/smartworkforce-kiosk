/**
 * Layout — Sidebar + main content wrapper for all admin pages.
 */

import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ALL_LINKS = [
  { to: '/dashboard',       label: '📊', text: 'Dashboard',       roles: null },
  { to: '/employees',       label: '👥', text: 'Employees',       roles: null },
  { to: '/branches',        label: '🏢', text: 'Branches',        roles: ['super_admin', 'client_admin', 'hr_payroll'] },
  { to: '/schedules',       label: '📅', text: 'Schedules',       roles: ['super_admin', 'client_admin', 'hr_payroll'] },
  { to: '/attendance',      label: '⏰', text: 'Attendance',      roles: null },
  { to: '/corrections',     label: '✏️', text: 'Corrections',    roles: null },
  { to: '/payroll/settings',label: '⚙️', text: 'Payroll Settings',roles: ['super_admin', 'client_admin', 'hr_payroll'] },
  { to: '/payroll/runs',    label: '💰', text: 'Payroll Runs',    roles: ['super_admin', 'client_admin', 'hr_payroll', 'auditor'] },
  { to: '/users',           label: '🔑', text: 'Users',           roles: ['super_admin', 'client_admin'] },
]

export default function Layout({ children }) {
  const { user, signOut } = useAuth()

  const visibleLinks = ALL_LINKS.filter(
    link => !link.roles || link.roles.includes(user?.role)
  )

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0 shadow-xl">
        {/* Brand */}
        <div className="p-5 border-b border-gray-700">
          <h1 className="text-lg font-bold text-blue-400">🎯 Apollo HR</h1>
          <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-800 text-blue-200 rounded-full">
            {user?.role?.replace('_', ' ')}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{link.label}</span>
              <span>{link.text}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            🚪 <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
