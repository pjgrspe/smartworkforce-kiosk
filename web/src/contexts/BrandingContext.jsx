/**
 * BrandingContext
 * Fetches tenant branding from /api/public/branding on app load
 * (no auth required). Provides companyName, shortName, tagline, logoBase64
 * to Login and Layout.
 */

import { createContext, useContext, useState, useEffect } from 'react'

const DEFAULT_BRANDING = {
  companyName: 'SmartWorkforce',
  shortName:   'SW',
  tagline:     'Workforce Management Platform.',
  logoBase64:  null,
}

const BrandingContext = createContext(DEFAULT_BRANDING)

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING)

  useEffect(() => {
    fetch('/api/public/branding')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data) setBranding({ ...DEFAULT_BRANDING, ...d.data }) })
      .catch(() => {})
  }, [])

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
