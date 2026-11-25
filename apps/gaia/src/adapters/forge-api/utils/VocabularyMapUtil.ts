/**
 * Maps each value list of a forge's board into Gaia's own union through a record typed `Record<forge value, Gaia value>`, so a value a forge
 * adds is a compile error here and nowhere else. The board's shapes check a value with `oneOf` over a record's keys.
 */
import type { AgentProgramRefusalCause, AgentToolUseDocument } from 'forge-contracts/BoardAgentDocuments';
import type { ForgeBoardCommand }                              from 'forge-contracts/BoardCommand';
import type {
  BoardInterruptionCause,
  BoardJobStopRequest,
  BoardJobTurn,
  BoardLostLineDocument,
  BoardSessionLastLineDocument,
  BoardSubagentDocument,
} from 'forge-contracts/BoardJobDocuments';
import type { BoardMergePrediction }   from 'forge-contracts/BoardMergeQueueDocument';
import type { BoardHephaestusSetting } from 'forge-contracts/BoardPageDocuments';
import type {
  ApplyRequestReason,
  ApplyRequestState,
  BoardEntityRefusalReason,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineStepRunTimeDocument,
  CheckedGateVerdict,
  DerivedSettingsSource,
  EntityAssignmentTicketDocument,
  GateCacheReport,
  GateCandidacy,
  GateProfileRunState,
  MergePlacement,
  PipelineApproval,
  PipelineBillingDocument,
  PipelineChangeDocument,
  PipelineCheckState,
  PipelineEdgeLabelKind,
  PipelineEdgeTone,
  PipelineFlowStage,
  PipelineGateRowDocument,
  PipelineInsertableStep,
  PipelineNodeDialogTarget,
  PipelineNodeKind,
  PipelineNodeMark,
  PipelineOccupantDocument,
  PipelineSetupMode,
  PipelineSetupStep,
  PipelineSetupStepState,
  PipelineStepEnding,
  PipelineSwitchState,
  ResearchFindingTopic,
  SetupEditDocument,
  SetupQuestionStep,
  SetupQuestionSubjectDocument,
  SourceAnnotationKind,
} from 'forge-contracts/BoardPipelineDocuments';
import type {
  BoardAttentionActionLabel,
  BoardAttentionKind,
  BoardAttentionStampWord,
  BoardTargetSubject,
} from 'forge-contracts/BoardReadingDocuments';
import type {
  AgentEffort,
  AgentModel,
  DisplayState,
  DocumentMessageState,
  DocumentProposalState,
  DocumentReadingRule,
  DocumentStanding,
  DraftState,
  EffectChange,
  EntityAgentRole,
  EntityKind,
  ForgeLevelAgentRole,
  GatePhase,
  JobState,
  PipelineAgentRole,
  ProposalMode,
  TaskStatus,
  TicketDocumentKind,
  TicketPriority,
  TicketSize,
  TicketStageName,
  TicketStatus,
  TicketType,
  TicketWritingRoute,
} from 'forge-contracts/BoardVocabulary';
import type { HephaestusRuntimeState }   from 'forge-contracts/ForgeBoardDocument';
import type { ForgeJobStopMode }         from 'forge-contracts/ForgeControlCommand';
import type { ForgeInterruptedWorkWait } from 'forge-contracts/ForgePresenceDocument';

import type * as Gaia from '../../../shared/@types/board/BoardVocabulary.ts';

const TICKET_STATUS = {
  'draft':            'draft',
  'ready-for-review': 'ready-for-review',
  'committed':        'committed',
  'in-progress':      'in-progress',
  'in-review':        'in-review',
  'reviewed':         'reviewed',
  'delivered':        'delivered',
  'abandoned':        'abandoned',
} as const satisfies Record<TicketStatus, Gaia.BoardTicketStatus>;

const TICKET_PRIORITY = { low: 'low', normal: 'normal', high: 'high' } as const satisfies Record<TicketPriority, Gaia.BoardTicketPriority>;

const TICKET_TYPE = { ticket: 'ticket', bug: 'bug', research: 'research' } as const satisfies Record<TicketType, Gaia.BoardTicketType>;

const TICKET_SIZE = {
  XS:  'XS',
  S:   'S',
  M:   'M',
  L:   'L',
  XL:  'XL',
  XXL: 'XXL',
} as const satisfies Record<TicketSize, Gaia.BoardTicketSize>;

const TASK_STATUS = {
  'committed':   'committed',
  'in-progress': 'in-progress',
  'paused':      'paused',
  'in-review':   'in-review',
  're-review':   're-review',
  'reviewed':    'reviewed',
  'delivered':   'delivered',
  'abandoned':   'abandoned',
} as const satisfies Record<TaskStatus, Gaia.BoardTaskStatus>;

const DISPLAY_STATE = {
  'draft':            'draft',
  'ready-for-review': 'ready-for-review',
  'committed':        'committed',
  'in-progress':      'in-progress',
  'paused':           'paused',
  'in-review':        'in-review',
  'reviewing':        'reviewing',
  're-review':        're-review',
  'reviewed':         'reviewed',
  'delivered':        'delivered',
  'abandoned':        'abandoned',
} as const satisfies Record<DisplayState, Gaia.BoardDisplayState>;

const TICKET_STAGE = {
  'build':          'build',
  'package-build':  'package-build',
  'package-review': 'package-review',
  'adapt':          'adapt',
  'review':         'review',
} as const satisfies Record<TicketStageName, Gaia.BoardTicketStage>;

const DRAFT_STATE = { waiting: 'waiting', researching: 'researching', resumable: 'resumable' } as const satisfies Record<DraftState, Gaia.BoardDraftState>;

const JOB_STATE = {
  'launching':          'launching',
  'preparing':          'preparing',
  'running':            'running',
  'waiting-for-answer': 'waiting-for-answer',
  'interrupted':        'interrupted',
  'awaiting-answer':    'awaiting-answer',
  'in-customs':         'in-customs',
  'gating':             'gating',
  'merging-main':       'merging-main',
  'merging':            'merging',
  'landing':            'landing',
  'stopping':           'stopping',
} as const satisfies Record<JobState, Gaia.BoardJobState>;

const GATE_PHASE = { build: 'build', review: 'review', merge: 'merge' } as const satisfies Record<GatePhase, Gaia.BoardGatePhase>;

const PIPELINE_AGENT_ROLE = {
  productOwner:       'productOwner',
  specAgent:          'specAgent',
  planAgent:          'planAgent',
  builder:            'builder',
  reviewer:           'reviewer',
  reReviewer:         'reReviewer',
  conflictReReviewer: 'conflictReReviewer',
  pipelineAgent:      'pipelineAgent',
  assistant:          'assistant',
} as const satisfies Record<PipelineAgentRole, Gaia.BoardPipelineAgentRole>;

const FORGE_LEVEL_AGENT_ROLE = {
  productOwner:  'productOwner',
  specAgent:     'specAgent',
  planAgent:     'planAgent',
  pipelineAgent: 'pipelineAgent',
  assistant:     'assistant',
} as const satisfies Record<ForgeLevelAgentRole, Gaia.BoardForgeLevelAgentRole>;

const ENTITY_AGENT_ROLE = {
  builder:            'builder',
  reviewer:           'reviewer',
  reReviewer:         'reReviewer',
  conflictReReviewer: 'conflictReReviewer',
} as const satisfies Record<EntityAgentRole, Gaia.BoardEntityAgentRole>;

const ENTITY_KIND = { app: 'app', package: 'package', root: 'root' } as const satisfies Record<EntityKind, Gaia.BoardEntityKind>;

const AGENT_EFFORT = {
  low:    'low',
  medium: 'medium',
  high:   'high',
  xhigh:  'xhigh',
  max:    'max',
} as const satisfies Record<AgentEffort, Gaia.BoardAgentEffort>;

const AGENT_MODEL = {
  haiku:  'haiku',
  sonnet: 'sonnet',
  opus:   'opus',
  fable:  'fable',
} as const satisfies Record<AgentModel, Gaia.BoardAgentModel>;

const HEPHAESTUS_STATE = {
  'serving':                'serving',
  'held-by-install-change': 'held-by-install-change',
  'restarting':             'restarting',
  'down':                   'down',
} as const satisfies Record<HephaestusRuntimeState, Gaia.BoardHephaestusState>;

const HEPHAESTUS_SETTING = { running: 'running', paused: 'paused' } as const satisfies Record<BoardHephaestusSetting, Gaia.BoardHephaestusSetting>;

const ATTENTION_KIND = {
  'escalated-question': 'escalated-question',
  'question':           'question',
  'draft-ticket':       'draft-ticket',
  'filing-draft':       'filing-draft',
  'review':             'review',
  'merge-accept':       'merge-accept',
} as const satisfies Record<BoardAttentionKind, Gaia.BoardAttentionKind>;

const ATTENTION_STAMP_WORD = {
  'opened':      'opened',
  'filed':       'filed',
  'ready since': 'ready since',
  'reviewed':    'reviewed',
} as const satisfies Record<BoardAttentionStampWord, Gaia.BoardAttentionStampWord>;

const ATTENTION_ACTION_LABEL = {
  Answer: 'Answer',
  Ready:  'Ready',
  Review: 'Review',
  Accept: 'Accept',
} as const satisfies Record<BoardAttentionActionLabel, Gaia.BoardAttentionActionLabel>;

const TARGET_SUBJECT = {
  decision: 'decision',
  ticket:   'ticket',
  draft:    'draft',
  job:      'job',
  incident: 'incident',
} as const satisfies Record<BoardTargetSubject, Gaia.BoardTargetSubject>;

const INTERRUPTION_CAUSE = {
  'child-lost':            'child-lost',
  'agent-crashed':         'agent-crashed',
  'reboot':                'reboot',
  'answer-delivery':       'answer-delivery',
  'usage-limit':           'usage-limit',
  'handoff-red':           'handoff-red',
  'forced-stop-refused':   'forced-stop-refused',
  'authentication-failed': 'authentication-failed',
  'talos-paused':          'talos-paused',
  'lease-ended':           'lease-ended',
  'network-outage':        'network-outage',
  'forge-stopped':         'forge-stopped',
  'forge-crashed':         'forge-crashed',
} as const satisfies Record<BoardInterruptionCause, Gaia.BoardInterruptionCause>;

const RESUME_WAIT = {
  instruction: 'instruction',
  answer:      'answer',
  decision:    'decision',
  nothing:     'nothing',
  never:       'never',
} as const satisfies Record<ForgeInterruptedWorkWait, Gaia.BoardResumeWait>;

const JOB_STOP_REQUEST = {
  'stop':      'stop',
  'wind-down': 'wind-down',
  'fresh':     'fresh',
} as const satisfies Record<BoardJobStopRequest, Gaia.BoardJobStopRequest>;

const JOB_STOP_MODE = { 'stop': 'stop', 'wind-down': 'wind-down' } as const satisfies Record<ForgeJobStopMode, Gaia.BoardJobStopMode>;

const JOB_TURN = { 'between-turns': 'between-turns', 'mid-turn': 'mid-turn' } as const satisfies Record<BoardJobTurn, Gaia.BoardJobTurn>;

const SUBAGENT_STATE = { running: 'running', ended: 'ended' } as const satisfies Record<BoardSubagentDocument['state'], Gaia.BoardSubagentState>;

const SESSION_LINE_ROLE = {
  assistant: 'assistant',
  user:      'user',
} as const satisfies Record<BoardSessionLastLineDocument['role'], Gaia.BoardSessionLineRole>;

const LOST_LINE_KIND = { gate: 'gate', install: 'install' } as const satisfies Record<BoardLostLineDocument['line'], Gaia.BoardLostLineKind>;

const MERGE_PREDICTION = {
  'clean':             'clean',
  'conflicting':       'conflicting',
  'prediction-failed': 'prediction-failed',
} as const satisfies Record<BoardMergePrediction, Gaia.BoardMergePrediction>;

const OFFERED_COMMAND_KIND = {
  'agent-look-again':           'agent-look-again',
  'chart-range-set':            'chart-range-set',
  'decision-answer':            'decision-answer',
  'gate-profile-start':         'gate-profile-start',
  'gate-profile-stop':          'gate-profile-stop',
  'intake-close':               'intake-close',
  'intake-start':               'intake-start',
  'job-fresh':                  'job-fresh',
  'job-message':                'job-message',
  'job-stop':                   'job-stop',
  'merge-accept':               'merge-accept',
  'merge-update':               'merge-update',
  'pipeline-agent-advise':      'pipeline-agent-advise',
  'pipeline-agent-set':         'pipeline-agent-set',
  'pipeline-apply':             'pipeline-apply',
  'pipeline-apply-cancel':      'pipeline-apply-cancel',
  'pipeline-assistant-set':     'pipeline-assistant-set',
  'pipeline-check':             'pipeline-check',
  'pipeline-constitution-edit': 'pipeline-constitution-edit',
  'pipeline-draft-discard':     'pipeline-draft-discard',
  'pipeline-draft-edit':        'pipeline-draft-edit',
  'pipeline-draft-undo':        'pipeline-draft-undo',
  'pipeline-setup-agent':       'pipeline-setup-agent',
  'pipeline-setup-answer':      'pipeline-setup-answer',
  'pipeline-setup-billing':     'pipeline-setup-billing',
  'pipeline-setup-resume':      'pipeline-setup-resume',
  'pipeline-setup-start':       'pipeline-setup-start',
  'pipeline-setup-start-over':  'pipeline-setup-start-over',
  'pipeline-setup-step':        'pipeline-setup-step',
  'pipeline-tools-set':         'pipeline-tools-set',
  'pipeline-update-start':      'pipeline-update-start',
  'ticket-deliver-by-hand':     'ticket-deliver-by-hand',
  'ticket-hold':                'ticket-hold',
  'ticket-network':             'ticket-network',
  'ticket-park':                'ticket-park',
  'ticket-priority':            'ticket-priority',
  'ticket-ready':               'ticket-ready',
  'ticket-unhold':              'ticket-unhold',
  'tracker-clear':              'tracker-clear',
} as const satisfies Record<ForgeBoardCommand['kind'], Gaia.BoardOfferedCommandKind>;

const PIPELINE_APPROVAL = {
  tickets: 'tickets', merge: 'merge', spec: 'spec', plan: 'plan'
} as const satisfies Record<PipelineApproval, Gaia.BoardPipelineApproval>;

const TICKET_WRITING_ROUTE = { 'one-ticket': 'one-ticket', 'spec-then-plan': 'spec-then-plan' } as const satisfies Record<TicketWritingRoute, Gaia.BoardTicketWritingRoute>;

const TICKET_DOCUMENT_KIND = { spec: 'spec', plan: 'plan' } as const satisfies Record<TicketDocumentKind, Gaia.BoardTicketDocumentKind>;

const DOCUMENT_READING_RULE = {
  'always':             'always',
  'if-person-approved': 'if-person-approved',
  'never':              'never',
} as const satisfies Record<DocumentReadingRule, Gaia.BoardDocumentReadingRule>;

const PROPOSAL_MODE = { 'ask-first': 'ask-first', 'auto-apply': 'auto-apply' } as const satisfies Record<ProposalMode, Gaia.BoardProposalMode>;

const DOCUMENT_STANDING = {
  'unwritten':              'unwritten',
  'drafting':               'drafting',
  'awaiting-review':        'awaiting-review',
  'approved':               'approved',
  'changed-since-approval': 'changed-since-approval',
  'out-of-date':            'out-of-date',
} as const satisfies Record<DocumentStanding, Gaia.BoardDocumentStanding>;

const DOCUMENT_MESSAGE_STATE = {
  queued: 'queued', sent: 'sent', applied: 'applied', withdrawn: 'withdrawn'
} as const satisfies Record<DocumentMessageState, Gaia.BoardDocumentMessageState>;

const DOCUMENT_PROPOSAL_STATE = {
  proposed: 'proposed', applied: 'applied', discarded: 'discarded', conflicted: 'conflicted'
} as const satisfies Record<DocumentProposalState, Gaia.BoardDocumentProposalState>;

const EFFECT_CHANGE = {
  adds: 'adds', changes: 'changes', removes: 'removes', unresolved: 'unresolved'
} as const satisfies Record<EffectChange, Gaia.BoardEffectChange>;

const BILLING_MODE = { subscription: 'subscription', api: 'api' } as const satisfies Record<PipelineBillingDocument['mode'], Gaia.BoardBillingMode>;

const SETUP_STEP = {
  billing:      'billing',
  agent:        'agent',
  research:     'research',
  entities:     'entities',
  constitution: 'constitution',
  design:       'design',
  apply:        'apply',
} as const satisfies Record<PipelineSetupStep, Gaia.BoardSetupStep>;

const AGENT_PROGRAM_REFUSAL_CAUSE = {
  'no-agent-chosen':       'no-agent-chosen',
  'other-vendor':          'other-vendor',
  'no-machine-program':    'no-machine-program',
  'relative-path':         'relative-path',
  'inside-forbidden-root': 'inside-forbidden-root',
  'batch-target':          'batch-target',
  'not-there':             'not-there',
  'not-executable':        'not-executable',
  'no-adapter':            'no-adapter',
  'did-not-start':         'did-not-start',
  'timed-out':             'timed-out',
  'failed':                'failed',
  'not-this-agent':        'not-this-agent',
} as const satisfies Record<AgentProgramRefusalCause, Gaia.BoardAgentProgramRefusalCause>;

const AGENT_TOOL_USE_KIND = {
  'prepare':   'prepare',
  'gate':      'gate',
  'every-job': 'every-job',
} as const satisfies Record<AgentToolUseDocument['kind'], Gaia.BoardAgentToolUseKind>;

const SETUP_STEP_STATE = {
  'not-started':   'not-started',
  'in-progress':   'in-progress',
  'done':          'done',
  'needs-recheck': 'needs-recheck',
} as const satisfies Record<PipelineSetupStepState, Gaia.BoardSetupStepState>;

const SETUP_MODE = { setup: 'setup', update: 'update', advise: 'advise' } as const satisfies Record<PipelineSetupMode, Gaia.BoardSetupMode>;

const FINDING_TOPIC = {
  'stack':                  'stack',
  'scripts':                'scripts',
  'conventions':            'conventions',
  'continuous-integration': 'continuous-integration',
  'note':                   'note',
  'layout':                 'layout',
} as const satisfies Record<ResearchFindingTopic, Gaia.BoardFindingTopic>;

const GATE_CANDIDACY = { 'gate': 'gate', 'not-a-gate': 'not-a-gate', 'unsure': 'unsure' } as const satisfies Record<GateCandidacy, Gaia.BoardGateCandidacy>;

const SETUP_QUESTION_STEP = {
  research:     'research',
  entities:     'entities',
  constitution: 'constitution',
  design:       'design',
} as const satisfies Record<SetupQuestionStep, Gaia.BoardSetupQuestionStep>;

const SETUP_QUESTION_SUBJECT_KIND = {
  node:    'node',
  gate:    'gate',
  rule:    'rule',
  finding: 'finding',
} as const satisfies Record<SetupQuestionSubjectDocument['kind'], Gaia.BoardSetupQuestionSubjectKind>;

const SOURCE_ANNOTATION_KIND = {
  'contributing':      'contributing',
  'research':          'research',
  'installed-default': 'installed-default',
} as const satisfies Record<SourceAnnotationKind, Gaia.BoardSourceAnnotationKind>;

const EDIT_AUTHOR = { agent: 'agent', user: 'user' } as const satisfies Record<SetupEditDocument['by'], Gaia.BoardEditAuthor>;

const APPLY_REQUEST_STATE = { committing: 'committing', held: 'held', refused: 'refused' } as const satisfies Record<ApplyRequestState, Gaia.BoardApplyRequestState>;

const APPLY_REQUEST_REASON = {
  'interrupted':                          'interrupted',
  'not-on-target-branch':                 'not-on-target-branch',
  'dirty-checkout':                       'dirty-checkout',
  'target-file-held':                     'target-file-held',
  'git-failed':                           'git-failed',
  'constitution-commit-unsigned':         'constitution-commit-unsigned',
  'constitution-commit-unexpected-paths': 'constitution-commit-unexpected-paths',
  'constitution-moved':                   'constitution-moved',
  'pipeline-moved':                       'pipeline-moved',
  'entity-named-by-tickets':              'entity-named-by-tickets',
  'entities-while-tickets-in-flight':     'entities-while-tickets-in-flight',
} as const satisfies Record<ApplyRequestReason, Gaia.BoardApplyRequestReason>;

const CHECK_STATE = {
  'queued':     'queued',
  'running':    'running',
  'checked':    'checked',
  'cannot-run': 'cannot-run',
  'stopped':    'stopped',
} as const satisfies Record<PipelineCheckState, Gaia.BoardCheckState>;

const CHECKED_GATE_VERDICT = {
  'green':       'green',
  'red':         'red',
  'cannot-run':  'cannot-run',
  'disagreeing': 'disagreeing',
} as const satisfies Record<CheckedGateVerdict, Gaia.BoardCheckedGateVerdict>;

const ENTITY_REFUSAL_REASON = {
  'more-than-one-root':                 'more-than-one-root',
  'equal-homes':                        'equal-homes',
  'reach-inside-another-home':          'reach-inside-another-home',
  'unknown-whitelist-key':              'unknown-whitelist-key',
  'unknown-dependency-key':             'unknown-dependency-key',
  'whitelisted-entity-not-package':     'whitelisted-entity-not-package',
  'whitelisted-package-without-review': 'whitelisted-package-without-review',
  'dependency-circle':                  'dependency-circle',
} as const satisfies Record<BoardEntityRefusalReason, Gaia.BoardEntityRefusalReason>;

const PIPELINE_NODE_KIND = {
  'ticket-creation':      'ticket-creation',
  'human-ticket-review':  'human-ticket-review',
  'spec-writing':         'spec-writing',
  'human-spec-review':    'human-spec-review',
  'plan-writing':         'plan-writing',
  'human-plan-review':    'human-plan-review',
  'builder':              'builder',
  'gates':                'gates',
  'review':               'review',
  're-review':            're-review',
  'merge-main-into-tree': 'merge-main-into-tree',
  'human-code-review':    'human-code-review',
  'ready-for-airlock':    'ready-for-airlock',
  'airlock':              'airlock',
  'fast-forward-main':    'fast-forward-main',
} as const satisfies Record<PipelineNodeKind, Gaia.BoardPipelineNodeKind>;

const PIPELINE_NODE_MARK = {
  unchanged: 'unchanged',
  proposed:  'proposed',
  changed:   'changed',
  new:       'new',
  removed:   'removed',
} as const satisfies Record<PipelineNodeMark, Gaia.BoardPipelineNodeMark>;

const MERGE_PLACEMENT = {
  'before-review':            'before-review',
  'before-human-code-review': 'before-human-code-review',
  'airlock':                  'airlock',
} as const satisfies Record<MergePlacement, Gaia.BoardMergePlacement>;

const DERIVED_SETTINGS_SOURCE = {
  'last-worker': 'last-worker',
  'builder':     'builder',
} as const satisfies Record<DerivedSettingsSource, Gaia.BoardDerivedSettingsSource>;

const SWITCH_STATE = { on: 'on', off: 'off' } as const satisfies Record<PipelineSwitchState, Gaia.BoardSwitchState>;

const NODE_DIALOG_TARGET = {
  'agent-step':            'agent-step',
  'review-step':           'review-step',
  'review-step-re-review': 'review-step-re-review',
  'merge-step':            'merge-step',
  'merge-step-re-review':  'merge-step-re-review',
  'gates-tab':             'gates-tab',
} as const satisfies Record<PipelineNodeDialogTarget, Gaia.BoardNodeDialogTarget>;

const EDGE_TONE = { forward: 'forward', rollback: 'rollback', loop: 'loop' } as const satisfies Record<PipelineEdgeTone, Gaia.BoardEdgeTone>;

const EDGE_LABEL_KIND = {
  'all-green':                     'all-green',
  'red-builder-fixes':             'red-builder-fixes',
  'conflict-or-red-builder-fixes': 'conflict-or-red-builder-fixes',
  'red-reviewer-fixes':            'red-reviewer-fixes',
  'red-last-worker-fixes':         'red-last-worker-fixes',
  'gates-again-after-re-review':   'gates-again-after-re-review',
} as const satisfies Record<PipelineEdgeLabelKind, Gaia.BoardEdgeLabelKind>;

const INSERTABLE_STEP = {
  'build-gates':       'build-gates',
  'review':            'review',
  'human-code-review': 'human-code-review',
  'review-gates':      'review-gates',
  're-review':         're-review',
  'merge-gates':       'merge-gates',
  'airlock-re-review': 'airlock-re-review',
} as const satisfies Record<PipelineInsertableStep, Gaia.BoardInsertableStep>;

const OCCUPANT_KIND = { ticket: 'ticket', draft: 'draft' } as const satisfies Record<PipelineOccupantDocument['occupantKind'], Gaia.BoardOccupantKind>;

const GATE_ROW_KIND = { prepare: 'prepare', gate: 'gate' } as const satisfies Record<PipelineGateRowDocument['rowKind'], Gaia.BoardGateRowKind>;

const CHANGE_KIND = { changed: 'changed', new: 'new', removed: 'removed' } as const satisfies Record<PipelineChangeDocument['changeKind'], Gaia.BoardChangeKind>;

const FLOW_STAGE = { proposal: 'proposal', live: 'live', editing: 'editing' } as const satisfies Record<PipelineFlowStage, Gaia.BoardFlowStage>;

const PROFILE_RUN_STATE = {
  'queued':     'queued',
  'running':    'running',
  'passed':     'passed',
  'red':        'red',
  'cannot-run': 'cannot-run',
  'timed-out':  'timed-out',
  'stopped':    'stopped',
} as const satisfies Record<GateProfileRunState, Gaia.BoardProfileRunState>;

const CACHE_REPORT = { hit: 'hit', partial: 'partial', miss: 'miss' } as const satisfies Record<GateCacheReport, Gaia.BoardCacheReport>;

const STEP_KIND = { prepare: 'prepare', gate: 'gate' } as const satisfies Record<BoardPipelineStepRunTimeDocument['stepKind'], Gaia.BoardStepKind>;

const STEP_ENDING = { 'passed': 'passed', 'failed': 'failed', 'time-bound': 'time-bound' } as const satisfies Record<PipelineStepEnding, Gaia.BoardStepEnding>;

const ASSIGNED_BY = {
  'product-owner': 'product-owner',
  'user':          'user',
} as const satisfies Record<NonNullable<EntityAssignmentTicketDocument['assignedBy']>, Gaia.BoardAssignedBy>;

const PIPELINE_HISTORY_KIND = {
  'pipeline-gate-added':       'pipeline-gate-added',
  'pipeline-gate-removed':     'pipeline-gate-removed',
  'pipeline-gates-none':       'pipeline-gates-none',
  'pipeline-gates-ordered':    'pipeline-gates-ordered',
  'pipeline-prepare-step-set': 'pipeline-prepare-step-set',
  'pipeline-approval-set':     'pipeline-approval-set',
  'pipeline-assistant-set':    'pipeline-assistant-set',
  'pipeline-setup-opened':     'pipeline-setup-opened',
  'pipeline-draft-discarded':  'pipeline-draft-discarded',
  'pipeline-setup-discarded':  'pipeline-setup-discarded',
  'hephaestus-set':            'hephaestus-set',
} as const satisfies Record<BoardPipelineHistoryEntryDocument['kind'], Gaia.BoardPipelineHistoryKind>;

/** Every value list of the board Gaia reads, each by the name of its union. */
const BOARD_VOCABULARIES = {
  ticketStatus:             TICKET_STATUS,
  ticketPriority:           TICKET_PRIORITY,
  ticketType:               TICKET_TYPE,
  ticketSize:               TICKET_SIZE,
  taskStatus:               TASK_STATUS,
  displayState:             DISPLAY_STATE,
  ticketStage:              TICKET_STAGE,
  draftState:               DRAFT_STATE,
  jobState:                 JOB_STATE,
  gatePhase:                GATE_PHASE,
  pipelineAgentRole:        PIPELINE_AGENT_ROLE,
  forgeLevelAgentRole:      FORGE_LEVEL_AGENT_ROLE,
  entityAgentRole:          ENTITY_AGENT_ROLE,
  entityKind:               ENTITY_KIND,
  agentEffort:              AGENT_EFFORT,
  agentModel:               AGENT_MODEL,
  hephaestusState:          HEPHAESTUS_STATE,
  hephaestusSetting:        HEPHAESTUS_SETTING,
  attentionKind:            ATTENTION_KIND,
  attentionStampWord:       ATTENTION_STAMP_WORD,
  attentionActionLabel:     ATTENTION_ACTION_LABEL,
  targetSubject:            TARGET_SUBJECT,
  interruptionCause:        INTERRUPTION_CAUSE,
  resumeWait:               RESUME_WAIT,
  jobStopRequest:           JOB_STOP_REQUEST,
  jobStopMode:              JOB_STOP_MODE,
  jobTurn:                  JOB_TURN,
  subagentState:            SUBAGENT_STATE,
  sessionLineRole:          SESSION_LINE_ROLE,
  lostLineKind:             LOST_LINE_KIND,
  mergePrediction:          MERGE_PREDICTION,
  offeredCommandKind:       OFFERED_COMMAND_KIND,
  pipelineApproval:         PIPELINE_APPROVAL,
  ticketWritingRoute:       TICKET_WRITING_ROUTE,
  ticketDocumentKind:       TICKET_DOCUMENT_KIND,
  documentReadingRule:      DOCUMENT_READING_RULE,
  proposalMode:             PROPOSAL_MODE,
  documentStanding:         DOCUMENT_STANDING,
  documentMessageState:     DOCUMENT_MESSAGE_STATE,
  documentProposalState:    DOCUMENT_PROPOSAL_STATE,
  effectChange:             EFFECT_CHANGE,
  billingMode:              BILLING_MODE,
  setupStep:                SETUP_STEP,
  setupStepState:           SETUP_STEP_STATE,
  agentProgramRefusalCause: AGENT_PROGRAM_REFUSAL_CAUSE,
  agentToolUseKind:         AGENT_TOOL_USE_KIND,
  setupMode:                SETUP_MODE,
  findingTopic:             FINDING_TOPIC,
  gateCandidacy:            GATE_CANDIDACY,
  setupQuestionStep:        SETUP_QUESTION_STEP,
  setupQuestionSubjectKind: SETUP_QUESTION_SUBJECT_KIND,
  sourceAnnotationKind:     SOURCE_ANNOTATION_KIND,
  editAuthor:               EDIT_AUTHOR,
  applyRequestState:        APPLY_REQUEST_STATE,
  applyRequestReason:       APPLY_REQUEST_REASON,
  checkState:               CHECK_STATE,
  checkedGateVerdict:       CHECKED_GATE_VERDICT,
  entityRefusalReason:      ENTITY_REFUSAL_REASON,
  pipelineNodeKind:         PIPELINE_NODE_KIND,
  pipelineNodeMark:         PIPELINE_NODE_MARK,
  mergePlacement:           MERGE_PLACEMENT,
  derivedSettingsSource:    DERIVED_SETTINGS_SOURCE,
  switchState:              SWITCH_STATE,
  nodeDialogTarget:         NODE_DIALOG_TARGET,
  edgeTone:                 EDGE_TONE,
  edgeLabelKind:            EDGE_LABEL_KIND,
  insertableStep:           INSERTABLE_STEP,
  occupantKind:             OCCUPANT_KIND,
  gateRowKind:              GATE_ROW_KIND,
  changeKind:               CHANGE_KIND,
  flowStage:                FLOW_STAGE,
  profileRunState:          PROFILE_RUN_STATE,
  cacheReport:              CACHE_REPORT,
  stepKind:                 STEP_KIND,
  stepEnding:               STEP_ENDING,
  assignedBy:               ASSIGNED_BY,
  pipelineHistoryKind:      PIPELINE_HISTORY_KIND,
} as const;

export type BoardVocabularyName = keyof typeof BOARD_VOCABULARIES;

type VocabularyRecord = Readonly<Record<string, string>>;

/** The forge value's Gaia value; the shape has already checked the value is one of the record's keys. */
function gaiaValueOf<ForgeValue extends string, GaiaValue extends string>(record: Readonly<Record<ForgeValue, GaiaValue>>, forgeValue: ForgeValue): GaiaValue {
  return record[forgeValue];
}

function gaiaValuesOf<ForgeValue extends string, GaiaValue extends string>(
  record: Readonly<Record<ForgeValue, GaiaValue>>, forgeValues: readonly ForgeValue[],
): readonly GaiaValue[] {
  return forgeValues.map((forgeValue) => record[forgeValue]);
}

/** The forge values a record maps, for a shape's `oneOf`. */
function forgeValuesOf(record: VocabularyRecord): readonly string[] {
  return Object.keys(record);
}

/** A value that is `null` stays `null`. */
function nullableGaiaValueOf<ForgeValue extends string, GaiaValue extends string>(
  record: Readonly<Record<ForgeValue, GaiaValue>>, forgeValue: ForgeValue | null,
): GaiaValue | null {
  return forgeValue === null ? null : record[forgeValue];
}

/** An object keyed by every value of a vocabulary, its keys and values each mapped. */
function keyedRecordOf<ForgeKey extends string, GaiaKey extends string, ForgeValue, GaiaValue>(
  vocabulary: Readonly<Record<ForgeKey, GaiaKey>>, record: Readonly<Record<ForgeKey, ForgeValue>>, gaiaValueOfEntry: (forgeValue: ForgeValue) => GaiaValue,
): Readonly<Record<GaiaKey, GaiaValue>> {
  const forgeKeys = Object.keys(vocabulary) as ForgeKey[];
  return Object.fromEntries(forgeKeys.map((forgeKey) => [vocabulary[forgeKey], gaiaValueOfEntry(record[forgeKey])])) as Record<GaiaKey, GaiaValue>;
}

/** The same for an object that holds only some of a vocabulary's values as keys; an absent record holds none. */
function partiallyKeyedRecordOf<ForgeKey extends string, GaiaKey extends string, ForgeValue, GaiaValue>(
  vocabulary: Readonly<Record<ForgeKey, GaiaKey>>,
  record: Readonly<Partial<Record<ForgeKey, ForgeValue>>> | undefined,
  gaiaValueOfEntry: (forgeValue: ForgeValue) => GaiaValue,
): Readonly<Partial<Record<GaiaKey, GaiaValue>>> {
  const mapped: Partial<Record<GaiaKey, GaiaValue>> = {};
  for (const forgeKey of Object.keys(vocabulary) as ForgeKey[]) {
    const forgeValue = record?.[forgeKey];
    if (forgeValue !== undefined) mapped[vocabulary[forgeKey]] = gaiaValueOfEntry(forgeValue);
  }
  return mapped;
}

export const VocabularyMapUtil = {
  vocabularies: BOARD_VOCABULARIES,
  gaiaValueOf,
  gaiaValuesOf,
  nullableGaiaValueOf,
  forgeValuesOf,
  keyedRecordOf,
  partiallyKeyedRecordOf,
} as const;
