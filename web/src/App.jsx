/**
 * App Component
 * Main application with routing and context providers
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Kiosk from './pages/Kiosk'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Branches from './pages/Branches'
import Schedules from './pages/Schedules'
import Attendance from './pages/Attendance'
import Corrections from './pages/Corrections'
import PayrollSettings from './pages/PayrollSettings'
import PayrollRuns from './pages/PayrollRuns'
import Users from './pages/Users'

// Wrap a page in the sidebar Layout
function AdminPage({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
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

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

      {/* Kiosk is public — no login required (uses tenant code stored in localStorage) */}
      <Route path="/kiosk" element={<Kiosk />} />

      {/* Admin / HR pages — all protected */}
      <Route path="/dashboard" element={
        <AdminPage><Dashboard /></AdminPage>
      } />
      <Route path="/employees" element={
        <AdminPage><Employees /></AdminPage>
      } />
      <Route path="/branches" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}><Branches /></AdminPage>
      } />
      <Route path="/schedules" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}><Schedules /></AdminPage>
      } />
      <Route path="/attendance" element={
        <AdminPage><Attendance /></AdminPage>
      } />
      <Route path="/corrections" element={
        <AdminPage><Corrections /></AdminPage>
      } />
      <Route path="/payroll/settings" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll']}><PayrollSettings /></AdminPage>
      } />
      <Route path="/payroll/runs" element={
        <AdminPage roles={['super_admin','client_admin','hr_payroll','auditor']}><PayrollRuns /></AdminPage>
      } />
      <Route path="/users" element={
        <AdminPage roles={['super_admin','client_admin']}><Users /></AdminPage>
      } />

      {/* Legacy /admin → dashboard */}
      <Route path="/admin" element={<Navigate to="/dashboard" />} />

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WebSocketProvider>
          <AppRoutes />
        </WebSocketProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

