import { useState } from 'react'
import {
  Activity,
  Brain,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  MessageSquareWarning,
  ShieldCheck,
  UsersRound
} from 'lucide-react'
import type { BarkosCompany, BarkosRole, BarkosWorker } from '../../../../shared/barkos/company'
import type {
  BarkosControlPolicy,
  BarkosControlPolicyUpdates
} from '../../../../shared/barkos/control-policy'
import type { BarkosDecisionInbox } from '../../../../shared/barkos/decision-inbox'
import type { BarkosMemoryVault } from '../../../../shared/barkos/memory-vault'
import type { BarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity'
import type { BarkosUsageCostLedger } from '../../../../shared/barkos/usage-cost-ledger'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { Badge } from '@/components/ui/badge'
import type { BarkosWorkLedgerLoadState } from '@/store/slices/barkos-work-ledger'
import type { BarkosDecisionInboxLoadState } from '@/store/slices/barkos-decision-inbox'
import type { BarkosMemoryVaultLoadState } from '@/store/slices/barkos-memory-vault'
import type { BarkosProviderCapacityLoadState } from '@/store/slices/barkos-provider-capacity'
import type { BarkosControlPolicyLoadState } from '@/store/slices/barkos-control-policy'
import { translate } from '@/i18n/i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarkosCompanyRoster } from './BarkosCompanyRoster'
import { BarkosControlCenter } from './BarkosControlCenter'
import { BarkosDecisionInbox as BarkosDecisionInboxView } from './BarkosDecisionInbox'
import { BarkosMemoryVault as BarkosMemoryVaultView } from './BarkosMemoryVault'
import { BarkosLiveOffice } from './BarkosLiveOffice'
import { BarkosObjectiveBoard } from './BarkosObjectiveBoard'
import { BarkosProviderCapacity } from './BarkosProviderCapacity'
import { BarkosUsageCost } from './BarkosUsageCost'
import { BarkosOfficeBanner } from './BarkosOfficeBanner'
import { useBarkosLiveOfficeProjection } from './use-barkos-live-office-projection'
import type { BarkosDecisionInboxController } from './use-barkos-decision-inbox'
import type { BarkosMemoryVaultController } from './use-barkos-memory-vault'
import type { BarkosOrchestrationActions } from './use-barkos-orchestration-actions'
import type { BarkosEvidenceSubmissionController } from './use-barkos-evidence-submission'
import type { BarkosProviderCapacityController } from './use-barkos-provider-capacity'
import type { BarkosUsageCostController } from './use-barkos-usage-cost'

type Props = {
  company: BarkosCompany
  controlPolicy: BarkosControlPolicy | null
  controlPolicyLoadState: BarkosControlPolicyLoadState
  controlPolicyError: string | null
  onReloadControlPolicy: () => Promise<BarkosControlPolicy | null>
  onUpdateControlPolicy: (updates: BarkosControlPolicyUpdates) => Promise<BarkosControlPolicy>
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  workLedger: BarkosWorkLedger | null
  workLedgerLoadState: BarkosWorkLedgerLoadState
  workLedgerError: string | null
  decisionInbox: BarkosDecisionInbox | null
  decisionInboxLoadState: BarkosDecisionInboxLoadState
  decisionInboxError: string | null
  decisionInboxController: BarkosDecisionInboxController
  memoryVault: BarkosMemoryVault | null
  memoryVaultLoadState: BarkosMemoryVaultLoadState
  memoryVaultError: string | null
  memoryVaultController: BarkosMemoryVaultController
  providerCapacity: BarkosProviderCapacityLedger | null
  providerCapacityLoadState: BarkosProviderCapacityLoadState
  providerCapacityError: string | null
  providerCapacityController: BarkosProviderCapacityController
  usageCost: BarkosUsageCostLedger | null
  usageCostController: BarkosUsageCostController
  onAddWorker: () => void
  onEditWorker: (worker: BarkosWorker) => void
  onLaunchWorker: (worker: BarkosWorker) => void
  onAddRole: () => void
  onEditRole: (role: BarkosRole) => void
  onReloadWorkLedger: () => void
  onCreateObjective: () => void
  onReviewEvidence: (evidenceId: string, decision: 'accepted' | 'rejected') => Promise<void>
  orchestration: BarkosOrchestrationActions
  onSubmitEvidence: BarkosEvidenceSubmissionController['open']
  projectIntakeBusy: boolean
  initialProjectRequest?: string | null
  onStartProject: (request: string) => Promise<boolean>
}

export function BarkosCompanyWorkspace({
  company,
  controlPolicy,
  controlPolicyLoadState,
  controlPolicyError,
  onReloadControlPolicy,
  onUpdateControlPolicy,
  workerSessions,
  workLedger,
  workLedgerLoadState,
  workLedgerError,
  decisionInbox,
  decisionInboxLoadState,
  decisionInboxError,
  decisionInboxController,
  memoryVault,
  memoryVaultLoadState,
  memoryVaultError,
  memoryVaultController,
  providerCapacity,
  providerCapacityLoadState,
  providerCapacityError,
  providerCapacityController,
  usageCost,
  usageCostController,
  onAddWorker,
  onEditWorker,
  onLaunchWorker,
  onAddRole,
  onEditRole,
  onReloadWorkLedger,
  onCreateObjective,
  onReviewEvidence,
  orchestration,
  onSubmitEvidence,
  projectIntakeBusy,
  initialProjectRequest,
  onStartProject
}: Props): React.JSX.Element {
  const [selectedSection, setSelectedSection] = useState('roster')
  const pendingDecisionCount =
    decisionInbox?.requests.filter((request) => request.status === 'pending').length ?? 0
  const pendingMemoryCount =
    memoryVault?.candidates.filter((candidate) => candidate.status === 'pending').length ?? 0
  const officeEntries = useBarkosLiveOfficeProjection({
    company,
    ledger: workLedger?.companyId === company.id ? workLedger : null,
    workerSessions,
    workerSessionStates: orchestration.workerSessionStates
  })
  return (
    <Tabs
      value={selectedSection}
      onValueChange={setSelectedSection}
      className="mx-auto w-full max-w-6xl gap-4"
    >
      <BarkosOfficeBanner
        company={company}
        entries={officeEntries}
        onAddWorker={onAddWorker}
        onLaunchWorker={onLaunchWorker}
        onOpenOffice={() => setSelectedSection('office')}
        projectIntakeBusy={projectIntakeBusy}
        initialProjectRequest={initialProjectRequest}
        onStartProject={onStartProject}
      />
      <TabsList aria-label={translate('barkos.company.page.sections', 'Şirket bölümleri')}>
        <TabsTrigger value="roster">
          <UsersRound className="size-3.5" />
          {translate('barkos.company.page.roster', 'Şirket')}
        </TabsTrigger>
        <TabsTrigger value="objectives">
          <ClipboardList className="size-3.5" />
          {translate('barkos.company.page.objectives', 'Hedef panosu')}
        </TabsTrigger>
        <TabsTrigger value="office">
          <Activity className="size-3.5" />
          {translate('barkos.company.page.office', 'Canlı ofis')}
        </TabsTrigger>
        <TabsTrigger value="decisions">
          <MessageSquareWarning className="size-3.5" />
          {translate('barkos.company.page.decisions', 'Kararlar')}
          {pendingDecisionCount > 0 ? (
            <Badge variant="default" className="h-5 px-1.5 text-[11px]">
              {pendingDecisionCount}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="memory">
          <Brain className="size-3.5" />
          {translate('barkos.company.page.memory', 'Hafıza')}
          {pendingMemoryCount > 0 ? (
            <Badge variant="default" className="h-5 px-1.5 text-[11px]">
              {pendingMemoryCount}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="capacity">
          <Gauge className="size-3.5" />
          {translate('barkos.company.page.capacity', 'Kapasite')}
        </TabsTrigger>
        <TabsTrigger value="cost">
          <CircleDollarSign className="size-3.5" />
          {translate('barkos.company.page.cost', 'Kullanım ve maliyet')}
        </TabsTrigger>
        <TabsTrigger value="control">
          <ShieldCheck className="size-3.5" />
          {translate('barkos.company.page.control', 'Kontrol')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="roster">
        <BarkosCompanyRoster
          company={company}
          workerSessions={workerSessions}
          workerSessionStates={orchestration.workerSessionStates}
          onAddWorker={onAddWorker}
          onEditWorker={onEditWorker}
          onLaunchWorker={onLaunchWorker}
          onAddRole={onAddRole}
          onEditRole={onEditRole}
        />
      </TabsContent>
      <TabsContent value="objectives">
        <BarkosObjectiveBoard
          company={company}
          ledger={workLedger?.companyId === company.id ? workLedger : null}
          loadState={workLedgerLoadState}
          error={workLedgerError}
          onRetry={onReloadWorkLedger}
          onCreateObjective={onCreateObjective}
          onReview={onReviewEvidence}
          operation={orchestration.operation}
          terminalReadyWorkerIds={orchestration.terminalReadyWorkerIds}
          workerSessionStates={orchestration.workerSessionStates}
          onMaterializeObjective={orchestration.materializeObjective}
          onAssignTask={orchestration.assignTask}
          onDecideDispatch={orchestration.decideDispatch}
          onDispatchAssignment={orchestration.dispatchAssignment}
          onStopDispatch={orchestration.stopDispatch}
          onReassignDispatch={orchestration.reassignDispatch}
          onSubmitEvidence={onSubmitEvidence}
        />
      </TabsContent>
      <TabsContent value="office">
        <BarkosLiveOffice
          company={company}
          entries={officeEntries}
          ledger={workLedger?.companyId === company.id ? workLedger : null}
        />
      </TabsContent>
      <TabsContent value="decisions">
        <BarkosDecisionInboxView
          company={company}
          ledger={workLedger?.companyId === company.id ? workLedger : null}
          inbox={decisionInbox?.companyId === company.id ? decisionInbox : null}
          loadState={decisionInboxLoadState}
          error={decisionInboxError}
          controller={decisionInboxController}
        />
      </TabsContent>
      <TabsContent value="memory">
        <BarkosMemoryVaultView
          vault={
            memoryVault?.companyId === company.id &&
            memoryVault.companyCreatedAt === company.createdAt
              ? memoryVault
              : null
          }
          loadState={memoryVaultLoadState}
          error={memoryVaultError}
          controller={memoryVaultController}
        />
      </TabsContent>
      <TabsContent value="capacity">
        <BarkosProviderCapacity
          ledger={
            providerCapacity?.companyId === company.id &&
            providerCapacity.companyCreatedAt === company.createdAt
              ? providerCapacity
              : null
          }
          loadState={providerCapacityLoadState}
          error={providerCapacityError}
          controller={providerCapacityController}
        />
      </TabsContent>
      <TabsContent value="cost">
        <BarkosUsageCost
          ledger={
            usageCost?.companyId === company.id && usageCost.companyCreatedAt === company.createdAt
              ? usageCost
              : null
          }
          workLedger={workLedger?.companyId === company.id ? workLedger : null}
          controller={usageCostController}
        />
      </TabsContent>
      <TabsContent value="control">
        <BarkosControlCenter
          policy={
            controlPolicy?.companyId === company.id &&
            controlPolicy.companyCreatedAt === company.createdAt
              ? controlPolicy
              : null
          }
          ledger={workLedger?.companyId === company.id ? workLedger : null}
          loadState={controlPolicyLoadState}
          error={controlPolicyError}
          onRetry={onReloadControlPolicy}
          onUpdate={onUpdateControlPolicy}
        />
      </TabsContent>
    </Tabs>
  )
}
