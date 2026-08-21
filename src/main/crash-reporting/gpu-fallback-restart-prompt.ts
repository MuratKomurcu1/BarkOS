import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { translateMain } from '../i18n/main-i18n'

export type GpuFallbackRestartDecision = 'restart' | 'continue'

function getGpuFallbackRestartOptions(): MessageBoxOptions {
  return {
    type: 'warning',
    buttons: [
      translateMain('gpuFallback.restart', 'Restart in Safe Graphics Mode'),
      translateMain('gpuFallback.continue', 'Keep Running')
    ],
    defaultId: 0,
    cancelId: 1,
    title: translateMain('gpuFallback.title', 'Restart BarkOS in Safe Graphics Mode?'),
    message: translateMain(
      'gpuFallback.message',
      "BarkOS's graphics process has crashed repeatedly."
    ),
    detail: translateMain(
      'gpuFallback.detail',
      'Safe graphics mode disables hardware acceleration and WebGL for this BarkOS version. Terminals and 3D content may render more slowly. Keep Running leaves graphics settings unchanged.'
    )
  }
}

export async function promptForGpuFallbackRestart(
  parentWindow?: BrowserWindow
): Promise<GpuFallbackRestartDecision> {
  const options = getGpuFallbackRestartOptions()
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options)
  return response === 0 ? 'restart' : 'continue'
}
