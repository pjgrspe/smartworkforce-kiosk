/**
 * Payroll — Company Settings page.
 */

import { useState, useEffect } from 'react'
import { getTenantSettings, updateTenantSettings } from '../config/api'
import { DEFAULT_PAYSLIP_SETTINGS, resolvePayslipSettings } from '../lib/payrollExport'

const inputCls = 'field-base text-xs'

export default function PayrollSettings() {
  const [settings,    setSettings]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [saveNotice,  setSaveNotice]  = useState({ type: '', text: '' })

  useEffect(() => {
    getTenantSettings().then(res => setSettings(res?.data)).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true); setSaveNotice({ type: '', text: '' })
    try {
      await updateTenantSettings({ settings: settings.settings })
      setSaveNotice({ type: 'success', text: 'Company settings saved successfully.' })
    } catch (err) {
      setSaveNotice({ type: 'error', text: err.message || 'Failed to save settings.' })
    } finally { setSaving(false) }
  }

  const setOt = (key, val) => setSettings(prev => ({
    ...prev,
    settings: { ...prev.settings, overtimeMultipliers: { ...prev.settings.overtimeMultipliers, [key]: parseFloat(val) } }
  }))

  const setNd = (key, val) => setSettings(prev => ({
    ...prev,
    settings: { ...prev.settings, nightDiffWindow: { ...prev.settings.nightDiffWindow, [key]: val } }
  }))

  const setPayslipField = (key, val) => setSettings((prev) => ({
    ...prev,
    settings: {
      ...prev.settings,
      payslip: { ...resolvePayslipSettings(prev), ...prev.settings?.payslip, [key]: val }
    }
  }))

  const setPayslipSignatory = (key, val) => setSettings((prev) => ({
    ...prev,
    settings: {
      ...prev.settings,
      payslip: {
        ...resolvePayslipSettings(prev),
        ...prev.settings?.payslip,
        signatories: { ...DEFAULT_PAYSLIP_SETTINGS.signatories, ...prev.settings?.payslip?.signatories, [key]: val }
      }
    }
  }))

  const s       = settings?.settings || {}
  const ot      = s.overtimeMultipliers || {}
  const nd      = s.nightDiffWindow    || {}
  const payslip = settings ? resolvePayslipSettings(settings) : null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Payroll Settings</h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!settings ? (
          <div className="text-center py-8 text-navy-400">Loading settings...</div>
        ) : (
          <div className="max-w-2xl space-y-6 pb-24">

            <div className="bg-navy-700 rounded-lg border border-navy-500 p-5">
              <h4 className="text-xs font-semibold text-navy-100 mb-4 uppercase tracking-wider">General</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-caps mb-1 block">Grace Period (min)</label>
                  <input type="number" className={inputCls} value={s.gracePeriodMinutes ?? 5}
                    onChange={e => setSettings(p => ({ ...p, settings: { ...p.settings, gracePeriodMinutes: +e.target.value } }))} />
                </div>
                <div>
                  <label className="label-caps mb-1 block">Rounding Rule (min, 0 = none)</label>
                  <input type="number" className={inputCls} value={s.roundingRuleMinutes ?? 0}
                    onChange={e => setSettings(p => ({ ...p, settings: { ...p.settings, roundingRuleMinutes: +e.target.value } }))} />
                </div>
              </div>
            </div>

            <div className="bg-navy-700 rounded-lg border border-navy-500 p-5">
              <h4 className="text-xs font-semibold text-navy-100 mb-4 uppercase tracking-wider">OT Multipliers (DOLE defaults)</h4>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'regular',        label: 'Regular OT'        },
                  { key: 'restDay',        label: 'Rest Day OT'       },
                  { key: 'specialHoliday', label: 'Special Holiday OT' },
                  { key: 'regularHoliday', label: 'Regular Holiday OT' },
                  { key: 'nightDiff',      label: 'Night Diff Rate (additive)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="label-caps mb-1 block">{label}</label>
                    <input type="number" step="0.01" className={inputCls} value={ot[key] ?? ''}
                      onChange={e => setOt(key, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-navy-700 rounded-lg border border-navy-500 p-5">
              <h4 className="text-xs font-semibold text-navy-100 mb-4 uppercase tracking-wider">Night Differential Window</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-caps mb-1 block">Start Time</label>
                  <input type="time" className={inputCls} value={nd.start || '22:00'} onChange={e => setNd('start', e.target.value)} />
                </div>
                <div>
                  <label className="label-caps mb-1 block">End Time</label>
                  <input type="time" className={inputCls} value={nd.end || '06:00'} onChange={e => setNd('end', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="bg-navy-700 rounded-lg border border-navy-500 p-5 space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-navy-100 mb-4 uppercase tracking-wider">Payslip Document</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label-caps mb-1 block">Company Display Name</label>
                    <input className={inputCls} value={payslip.companyDisplayName}
                      onChange={e => setPayslipField('companyDisplayName', e.target.value)} />
                  </div>
                  <div>
                    <label className="label-caps mb-1 block">Document Subtitle</label>
                    <input className={inputCls} value={payslip.headerSubtitle}
                      onChange={e => setPayslipField('headerSubtitle', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label-caps mb-1 block">Address / Header Line</label>
                    <input className={inputCls} value={payslip.companyAddressLine}
                      onChange={e => setPayslipField('companyAddressLine', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label-caps mb-1 block">Footer Note</label>
                    <textarea rows={3} className="field-base w-full px-3 py-2 text-sm resize-none"
                      value={payslip.footerNote}
                      onChange={e => setPayslipField('footerNote', e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-navy-100 mb-4 uppercase tracking-wider">Payslip Signatories</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'preparedByName',  label: 'Prepared By Name'  },
                    { key: 'preparedByTitle', label: 'Prepared By Title' },
                    { key: 'reviewedByName',  label: 'Reviewed By Name'  },
                    { key: 'reviewedByTitle', label: 'Reviewed By Title' },
                    { key: 'approvedByName',  label: 'Approved By Name'  },
                    { key: 'approvedByTitle', label: 'Approved By Title' },
                    { key: 'receivedByLabel', label: 'Employee Signature Label' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="label-caps mb-1 block">{label}</label>
                      <input className={inputCls} value={payslip.signatories[key]}
                        onChange={e => setPayslipSignatory(key, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-20 -mx-2 border-t border-navy-500/70 bg-navy-900/95 px-2 py-3 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-navy-500/60 bg-navy-800/70 px-4 py-3">
                <div>
                  {saveNotice.text ? (
                    <p className={`text-xs font-medium ${saveNotice.type === 'success' ? 'text-signal-success' : 'text-signal-danger'}`}>
                      {saveNotice.text}
                    </p>
                  ) : (
                    <p className="text-2xs text-navy-300">Make changes, then save to apply them to payroll exports and computations.</p>
                  )}
                </div>
                <button onClick={save} disabled={saving}
                  className="px-6 py-2 bg-accent text-white rounded-md hover:bg-accent-400 disabled:opacity-50 text-sm font-medium">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
