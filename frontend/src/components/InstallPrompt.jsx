import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

/**
 * Captures the browser's `beforeinstallprompt` event and surfaces a small,
 * dismissible "Install app" button so users can install Social Hub as a
 * standalone PWA on any device (desktop or mobile).
 *
 * The button only appears when the browser reports the app is installable.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('sums_install_dismissed') === '1'
  )

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => setDeferredPrompt(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferredPrompt || dismissed) return null

  const install = async () => {
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const dismiss = () => {
    sessionStorage.setItem('sums_install_dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="install-prompt" role="region" aria-label="Install app">
      <button className="install-prompt-btn" onClick={install}>
        <Download size={16} /> Install app
      </button>
      <button className="install-prompt-close" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={14} />
      </button>
    </div>
  )
}
