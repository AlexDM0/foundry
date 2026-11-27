import type { DecisionKind }                                     from '../@types/Decision.ts';
import type { IncidentDefaultCause, IncidentKind, IncidentMove } from '../@types/Incident.ts';

export const DECISION_KINDS = [
  'agent-question',
  'parked',
  'waiver',
  'landing-refused',
  'merge-refused',
  'checks-not-set',
  'target-moved',
  'branch-touches-agent-config',
  'outage',
  'quiet-job',
  'leftover-worktree',
  'forced-stop-refused',
  'pipeline-proposal',
  'api-key-not-set',
  'api-authentication-failed',
  'budget-reached',
  'need-for-root',
  'need-closes-circle',
  'need-abandoned',
  'work-in-other-entity',
  'whitelist-removed-mid-crossing',
  'package-refused',
  'second-return',
  'dependent-broken',
] as const satisfies readonly DecisionKind[];

/** Who opens a decision beside an agent of a job role. */
export const NON_AGENT_DECISION_ASKERS = ['hephaestus', 'assistant'] as const;

export const INCIDENT_KINDS = [
  'system-question',
  'malformed-ticket',
  'setup-failed',
  'out-of-calls',
  'blocked',
  'job-lost',
  'resume-failed',
  'gate-cannot-run',
  'sandbox-unavailable',
  'quiet-job',
  'setup-snapshot-touched',
  'document-snapshot-touched',
  'system-file-unreadable',
] as const satisfies readonly IncidentKind[];

export const INCIDENT_MOVES = [
  'incident-answer',
  'incident-escalate',
  'incident-note',
  'job-fresh',
  'job-message',
  'worktree-repair',
  'gate-retry',
  'ticket-park',
  'open-quiet-job-decision',
] as const satisfies readonly IncidentMove[];

export const INCIDENT_DEFAULT_CAUSES = ['turn-closed', 'turn-budget', 'no-assistant', 'assistant-off'] as const satisfies readonly IncidentDefaultCause[];

export const DECISION_ID_PREFIX = 'E';

/** Why an open decision of a retired kind is withdrawn at the next pass. */
export const RETIRED_DECISION_REASON = 'its kind retired: the pipeline is set up through the setup record';

/** Why an open `checks-not-set` decision is withdrawn when an Apply stores a pipeline. */
export const PIPELINE_APPLIED_DECISION_REASON = 'a pipeline was applied';

/** A ticket the lifecycle parks is held with this prefix before its park cause, as `parked:failed-passes`. */
export const PARKED_HOLD_PREFIX = 'parked:';

/** A ticket an interruption holds, as `interrupted:merge`; User's resume lifts it with no fresh attempt, unlike an unhold. */
export const INTERRUPTED_HOLD_PREFIX = 'interrupted:';

/** A ticket whose Airlock slot a start that waits found with no live holder: restored, and held until User's resume. */
export const INTERRUPTED_MERGE_HOLD = `${INTERRUPTED_HOLD_PREFIX}merge`;

export const INCIDENT_ID_PREFIX = 'I';

/** The number the first decision and the first incident a tracker opens take: the lowest counter a progress file may store. */
export const FIRST_DECISION_NUMBER = 1;

export const FIRST_INCIDENT_NUMBER = 1;

/** The fact naming the agent's question request an incident was opened for, so a replayed request opens nothing twice. */
export const REQUEST_ID_FACT = 'requestId';

/** The fact carrying an agent's questions as JSON, so an escalation puts exactly the agent's words to the user. */
export const QUESTIONS_FACT = 'questions';

/** A ticket whose job ended with its question open is held `awaiting answer (E7)` until User answers it. */
export const AWAITING_ANSWER_HOLD_PREFIX = 'awaiting answer';

/** The section of a ticket's body the answers to its ended job's questions go under, for the next agent. */
export const QUESTIONS_SECTION_HEADING = '## Questions';
