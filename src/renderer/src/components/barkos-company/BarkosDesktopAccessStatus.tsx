import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, MonitorCog } from 'lucide-react'
import type {
  ComputerUsePermissionState,
  ComputerUsePermissionStatusResult
} from '../../../../shared/computer-use-permissions-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'

const EMPTY_STATUS: ComputerUsePermissionStatusResult = {
  platform: 'darwin',
  helperAppPath: null,
  helperUnavailableReason: null,
  permissions: []
}

function permissionsReady(permissions: readonly ComputerUsePermissionState[]): boolean {
  return (
    permissions.length > 0 && permissions.every((permission) => permission.status === 'granted')
  )
}

export function BarkosDesktopAccessStatus(): React.JSX.Element | null {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const ready = useMemo(() => permissionsReady(status.permissions), [status.permissions])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setStatus(await window.api.computerUsePermissions.getStatus())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleFocus = (): void => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  if (!loading && status.platform !== 'darwin') {
    return null
  }

  if (ready) {
    return (
      <span className="barkos-desktop-access-ready">
        <CheckCircle2 className="size-3" />
        {translate('barkos.desktop.ready', 'Masaüstü ve uygulama erişimi hazır')}
      </span>
    )
  }

  const openSetup = async (): Promise<void> => {
    setOpening(true)
    try {
      await window.api.computerUsePermissions.openSetup()
      await refresh()
    } finally {
      setOpening(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={loading || opening || status.helperUnavailableReason !== null}
      onClick={() => void openSetup()}
    >
      {loading || opening ? (
        <LoaderCircle className="size-3 animate-spin" />
      ) : (
        <MonitorCog className="size-3" />
      )}
      {status.helperUnavailableReason
        ? translate('barkos.desktop.unavailable', 'Masaüstü yardımcısı kullanılamıyor')
        : translate('barkos.desktop.setup', 'Masaüstü erişimini hazırla')}
    </Button>
  )
}
