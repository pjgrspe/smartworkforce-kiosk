/**
 * Auth Context
 * Manages JWT-based authentication state.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, getToken } from '../config/api'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Rehydrate from stored token on page load
    const token = getToken()
    if (token) {
      const payload = parseJwt(token)
      // Treat any non-employee role with management rights as admin in the UI
      const adminRoles = ['super_admin', 'client_admin', 'hr_payroll']
      if (payload && payload.exp * 1000 > Date.now()) {
        setUser(payload)
        setIsAdmin(adminRoles.includes(payload.role))
      }
    }
    setLoading(false)
  }, [])

  const signIn = async (email, password) => {
    const data = await apiLogin(email, password)
    const payload = parseJwt(data.token)
    const adminRoles = ['super_admin', 'client_admin', 'hr_payroll']
    setUser({ ...payload, ...data.user })
    setIsAdmin(adminRoles.includes(payload.role))
    return data
  }

  const signOut = () => {
    apiLogout()
    setUser(null)
    setIsAdmin(false)
  }

  const value = {
    user,
    isAdmin,
    loading,
    signIn,
    signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

