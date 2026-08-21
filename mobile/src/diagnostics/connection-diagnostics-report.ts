import { isTailscaleEndpoint } from '../../../src/shared/remote-runtime-tailscale-hint'
import type { ConnectionLogEntry, ConnectionState } from '../transport/types'
import { formatEndpoint } from './host-reachability'

// Why: one shareable text blob answering everything we historically had to
// ask reporters one message at a time (endpoint type, state, attempt count,
// last-connected, versions, and the reconnect lifecycle log).
export function buildConnectionDiagnosticsReport(args: {
  hostName: string
  endpoint: string
  state: ConnectionState
  reconnectAttempts: number
  lastConnectedAt: number | null
  platform: string
  appVersion: string
  entries: readonly ConnectionLogEntry[]
  nowMs?: number
}): string {
  const now = args.nowMs ?? Date.now()
  const lines: string[] = []
  lines.push('BarkOS Mobil bağlantı tanılaması')
  lines.push(`Oluşturulma: ${new Date(now).toISOString()}`)
  lines.push(`Uygulama: BarkOS Mobil ${args.appVersion} · ${args.platform}`)
  lines.push(`Bilgisayar: ${args.hostName}`)
  lines.push(
    `Uç nokta: ${formatEndpoint(args.endpoint)}${isTailscaleEndpoint(args.endpoint) ? ' (Tailscale)' : ''}`
  )
  lines.push(`Durum: ${args.state} (yeniden bağlanma denemesi: ${args.reconnectAttempts})`)
  lines.push(
    args.lastConnectedAt == null
      ? 'Son bağlantı: bu oturumda hiç bağlanmadı'
      : `Son bağlantı: ${new Date(args.lastConnectedAt).toISOString()} (${formatAgo(now - args.lastConnectedAt)} önce)`
  )
  lines.push('')
  if (args.entries.length === 0) {
    lines.push('Bu oturumda bağlantı olayı kaydedilmedi.')
  } else {
    lines.push(`Bağlantı günlüğü (${args.entries.length} olay, önce en eski):`)
    for (const entry of args.entries) {
      const detail = entry.detail ? ` — ${entry.detail}` : ''
      lines.push(`${new Date(entry.ts).toISOString()} [${entry.level}] ${entry.message}${detail}`)
    }
  }
  return lines.join('\n')
}

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
