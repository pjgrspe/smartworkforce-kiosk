/**
 * App Component
 * Main application with routing and context providers
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { TenantProvider } from './contexts/TenantContext'
import Layout from './components/Layout'
import SensitiveAccessGate from './components/SensitiveAccessGate'
import Spinner from './components/ui/Spinner'
import Login from './pages/Login'
import Kiosk from './pages/Kiosk'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Branches from './pages/Branches'
import Schedules from './pages/Schedules'
import Attendance from './pages/Attendance'
import Corrections from './pages/Corrections'
import PayrollSalary from './pages/PayrollSalary'
import PayrollHolidays from './pages/PayrollHolidays'
import PayrollSettings from './pages/PayrollSettings'
import PayrollRuns from './pages/PayrollRuns'
import Users from './pages/Users'
import Tenants from './pages/Tenants'
import Profile from './pages/Profile'

// Wrap a page in the sidebar Layout
function AdminPage({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" />

  // Redirect to dashboard if role is not allowed
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" />
  }

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()

  const withSensitiveAccess = (node) => (
    <SensitiveAccessGate
      title="Sensitive Access"
      subtitle="Please confirm your password to continue."
    >
      {node}
    </SensitiveAccessGate>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

      {/* Kiosk — only accessible from branch PCs (localhost). Redirect to login on central server. */}
      <Route path="/kiosk" element={
        window.location.hostname === 'localhost' ? <Kiosk /> : <Navigate to="/login" />
      } />

      {/* Admin / HR pages — all protected */}
      <Route path="/dashboard" element={
        <AdminPage><Dashboard /></AdminPage>
      } />
      <Route path="/employees" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll','branch_manager','auditor']}><Employees /></AdminPage>
      } />
      <Route path="/branches" element={
        <AdminPage roles={['super_admin', 'client_admin']}><Branches /></AdminPage>
      } />
      <Route path="/schedules" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}><Schedules /></AdminPage>
      } />
      <Route path="/attendance" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll','branch_manager','auditor']}><Attendance /></AdminPage>
      } />
      <Route path="/corrections" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll','branch_manager','auditor']}><Corrections /></AdminPage>
      } />
      <Route path="/payroll/salary" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}>{withSensitiveAccess(<PayrollSalary />)}</AdminPage>
      } />
      <Route path="/payroll/holidays" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}>{withSensitiveAccess(<PayrollHolidays />)}</AdminPage>
      } />
      <Route path="/payroll/settings" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}>{withSensitiveAccess(<PayrollSettings />)}</AdminPage>
      } />
      <Route path="/payroll/runs" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll','auditor']}>{withSensitiveAccess(<PayrollRuns />)}</AdminPage>
      } />
      <Route path="/users" element={
        <AdminPage roles={['super_admin','client_admin']}>{withSensitiveAccess(<Users />)}</AdminPage>
      } />
      <Route path="/tenants" element={
        <AdminPage roles={['super_admin']}><Tenants /></AdminPage>
      } />
      <Route path="/profile" element={
        <AdminPage><Profile /></AdminPage>
      } />

      {/* Legacy /admin → dashboard */}
      <Route path="/admin" element={<Navigate to="/dashboard" />} />

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <WebSocketProvider>
              <AppRoutes />
            </WebSocketProvider>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

