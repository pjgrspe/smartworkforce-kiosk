import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './ui/Modal'
import { Input } from './ui/Input'
import { verifyPassword } from '../config/api'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'

export default function SensitiveAccessGate({ children, title = 'Sensitive Access', subtitle = 'Re-enter your password to continue.' }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [unlocked, setUnlocked] = useState(() => hasFreshSensitiveAuth())

  const showPrompt = useMemo(() => !unlocked, [unlocked])

  const confirm = async () => {
    if (!password) {
      setError('Password is required')
      return
    }

    setLoading(true)
    setError('')
    try {
      await verifyPassword(password)
      markSensitiveAuthNow()
      setUnlocked(true)
      setPassword('')
    } catch (err) {
      setError(err.message || 'Password verification failed')
    } finally {
      setLoading(false)
    }
  }

  if (showPrompt) {
    return (
      <Modal
        title={title}
        subtitle={subtitle}
        width="max-w-md"
        onClose={() => navigate('/dashboard')}
        onConfirm={confirm}
        confirmLabel="Continue"
        loading={loading}
      >
        <div className="space-y-3">
          {error && (
            <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">
              {error}
            </p>
          )}
          <Input
            label="Password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirm()
              }
            }}
          />
        </div>
      </Modal>
    )
  }

  return children
}
