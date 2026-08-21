import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { isTrustedUIRenderer } from './ui'
import {
  BundledSkillInstallRequestError,
  validateBundledSkillInstallRequest,
  type BundledSkillInstallResult,
  type BundledSkillStatus
} from '../../shared/bundled-skill-local-install'
import {
  getBundledSkillsLocalStatus,
  installBundledSkillsLocally
} from '../skills/bundled-skill-local-installer'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_bundled_skills_sender')
  }
}

async function loadBundledGuides() {
  // Why: the generated guide table is large; load it only when a skill call arrives.
  const { BUNDLED_SKILL_GUIDES } = await import('../../shared/bundled-skill-guides.js')
  return BUNDLED_SKILL_GUIDES
}

export function registerBarkosBundledSkillsHandlers(): void {
  ipcMain.handle('barkosBundledSkills:status', async (event): Promise<BundledSkillStatus> => {
    assertTrustedSender(event)
    return getBundledSkillsLocalStatus({ guides: await loadBundledGuides() })
  })

  ipcMain.handle(
    'barkosBundledSkills:install',
    async (event, request: unknown): Promise<BundledSkillInstallResult> => {
      assertTrustedSender(event)
      if (typeof request !== 'object' || request === null) {
        throw new BundledSkillInstallRequestError('Invalid install request.')
      }
      const { skills, agents } = validateBundledSkillInstallRequest({
        skills: (request as { skills?: unknown }).skills,
        agents: (request as { agents?: unknown }).agents
      })
      return installBundledSkillsLocally({
        skills,
        agents,
        mode: 'install',
        guides: await loadBundledGuides()
      })
    }
  )
}
