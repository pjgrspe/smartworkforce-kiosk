/**
 * TenantContext — tracks which company is currently being managed.
 *
 * super_admin: can switch between all registered tenants.
 * Everyone else: locked to their own tenant from the JWT.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { getTenants, setActiveTenantId } from '../config/api'

const TenantContext = createContext(null)

export const useTenant = () => useContext(TenantContext)

const STORAGE_KEY = 'sw_active_tenant'

export function TenantProvider({ children }) {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [tenants,       setTenants]       = useState([])
  const [activeTenant,  setActiveTenantState] = useState(null)

  // Load tenant list and restore last-used selection (super_admin only)
  useEffect(() => {
    if (!user) { setActiveTenantState(null); return }

    if (!isSuperAdmin) {
      // Non-super_admin: single tenant from JWT — no API call needed
      setActiveTenantState({ id: user.tenantId, name: null, code: null })
      setActiveTenantId(null) // no override needed — JWT already scopes correctly
      return
    }

    getTenants()
      .then(res => {
        const list = res.data || []
        setTenants(list)

        const saved = localStorage.getItem(STORAGE_KEY)
        const found = list.find(t => t.id === saved) || list[0] || null
        if (found) {
          setActiveTenantState(found)
          setActiveTenantId(found.id)
        }
      })
      .catch(() => {})
  }, [user, isSuperAdmin])

  function switchTenant(tenant) {
    if (!isSuperAdmin) return
    setActiveTenantState(tenant)
    setActiveTenantId(tenant.id)
    localStorage.setItem(STORAGE_KEY, tenant.id)
  }

  return (
    <TenantContext.Provider value={{ activeTenant, tenants, switchTenant, isSuperAdmin }}>
      {children}
    </TenantContext.Provider>
  )
}
