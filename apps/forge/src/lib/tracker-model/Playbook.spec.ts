/**
 * The Playbook's rules as claims: each a fact set, what must hold of the steps derived from it, and the mutant of the one line that
 * decides it. What matters is that every rule is watched failing: the claim holds on the policy as written and fails on its mutant, so no rule
 * survives a rewrite unnoticed. A mutant whose text stopped matching its line fails its build, never passes by changing nothing.
 */
import { describe, expect, test } from 'bun:test';

import { mutatedModuleOf, type SourceMutant } from '../../testing/SourceMutant.ts';
import type { Decision }                      from './@types/Decision.ts';
import type { Incident }                      from './@types/Incident.ts';
import type { InterruptionCause, Job }        from './@types/Job.ts';
import type { LifecycleLimits }               from './@types/LifecycleLimits.ts';
import type { LogRecord }                     from './@types/LogRecord.ts';
import type { PlaybookStep }                  from './@types/PlaybookStep.ts';
import type { TicketStatus }                  from './@types/Ticket.ts';
import type { PlaybookFacts }                 from './Playbook.ts';
import { Playbook }                           from './Playbook.ts';
import type { ResumePolicy }                  from './constants/ResumePolicy.ts';
import {
  FIXTURE_AT,
  FIXTURE_LIMITS,
  FIXTURE_OBSERVATIONS,
  LIVE_ASSISTANT,
  endedRecord,
  factsWith,
  finishedJobRecords,
  interruptedRecord,
  jobFixture,
  launchedRecord,
  launchedTicketIdsOf,
  resumeInstructedRecord,
  stagedLaunchedRecord,
  stepKindsOf,
  ticketOf,
  ticketRecord
}                                             from './testing/LifecycleFixtures.ts';

const POLICY_MODULE = 'src/lib/tracker-model/Playbook.ts';

const FAILED_PASS_MODULE = 'src/lib/tracker-model/utils/FailedPassUtil.ts';

const LAUNCH_SLOT_MODULE = 'src/lib/tracker-model/utils/LaunchSlotUtil.ts';

interface PolicyClaim {
  name:    string;
  facts:   PlaybookFacts;
  limits?: LifecycleLimits;
  holds:   (steps: readonly PlaybookStep[]) => boolean;
  mutant:  SourceMutant;
}

function policyLine(find: string, replace: string): SourceMutant {
  return { modulePath: POLICY_MODULE, find, replace };
}

function launchSlotLine(find: string, replace: string): SourceMutant {
  return { modulePath: LAUNCH_SLOT_MODULE, find, replace };
}

function pipelineAgentJob(): Job {
  return jobFixture({
    id: 'J7', kind: 'pipeline-agent', role: 'pipeline-agent', target: null
  });
}

function interruptedPipelineAgentJob(): Job {
  return jobFixture({
    id: 'J7', kind: 'pipeline-agent', role: 'pipeline-agent', target: null, state: 'interrupted', interruption: 'agent-crashed'
  });
}

function decisionOf(kind: Decision['kind']): Decision {
  return {
    id: 'E1', kind, ticketIds: [], jobId: null, askedBy: 'overseer', requestId: null, questions: [], context: '', openedAt: FIXTURE_AT,
  };
}

function incidentOf(overrides: Partial<Incident>): Incident {
  return {
    id: 'I1', kind: 'blocked', ticketIds: [], jobId: null, facts: {}, defaultMove: 'ticket-park', deliveredInTurn: null, openedAt: FIXTURE_AT, ...overrides,
  };
}

function holdsUnder(nextStepsOf: typeof Playbook.nextStepsOf, claim: PolicyClaim): boolean {
  try {
    return claim.holds(nextStepsOf(claim.facts, claim.limits ?? FIXTURE_LIMITS));
  } catch {
    return false;
  }
}

function launchesExactly(ticketIds: readonly string[]): (steps: readonly PlaybookStep[]) => boolean {
  return (steps) => launchedTicketIdsOf(steps).join(' ') === ticketIds.join(' ');
}

const INTERRUPTED_BUILD = jobFixture({
  id: 'J1', ticketIds: ['001'], state: 'interrupted', interruption: 'watcher-lost'
});

const TWO_FAILED_PASSES_WITH_REWORK_BETWEEN: LogRecord[] = [
  ticketRecord('ticket-started', '001'),
  ...finishedJobRecords('J1', 'build', '001', 'failed'),
  ticketRecord('ticket-finished', '001'),
  ...finishedJobRecords('J3', 'review', '001', 'does-not-hold'),
  ticketRecord('ticket-started', '001'),
];

const CRASHES_ON_TWO_TICKETS: LogRecord[] = [
  launchedRecord('J1', 'build', ['001']),
  launchedRecord('J2', 'build', ['002']),
  interruptedRecord('J1', 'agent-crashed'),
  interruptedRecord('J2', 'watcher-lost'),
];

const WAITING_REVIEW = jobFixture({
  id: 'J3', kind: 'review', role: 'reviewer', ticketIds: ['001'], state: 'awaiting-answer'
});

const WAIVER_OPENED_AND_ANSWERED: LogRecord[] = [
  {
    kind: 'decision-opened', decisionId: 'E1', fields: { kind: 'waiver', ticketIds: ['001'] }, at: FIXTURE_AT
  },
  {
    kind: 'decision-answered', decisionId: 'E1', fields: { answer: { 'Waive the proposed items?': 'Grant' } }, at: FIXTURE_AT
  },
];

/** One failed pass in stage 2, a stage 4 between, and one more after the return to stage 2: a stage that starts again counts from zero. */
const FAILED_PASSES_IN_TWO_ENTRIES_OF_A_STAGE: LogRecord[] = [
  stagedLaunchedRecord('J1', 'build', '001', 'ui', 2),
  endedRecord('J1', 'failed'),
  stagedLaunchedRecord('J2', 'build', '001', 'shop', 4),
  endedRecord('J2', 'built'),
  stagedLaunchedRecord('J3', 'build', '001', 'ui', 2, 2),
  endedRecord('J3', 'failed'),
];

/** Two entities of one stage each failed once. */
const FAILED_PASSES_IN_TWO_ENTITIES_OF_A_STAGE: LogRecord[] = [
  stagedLaunchedRecord('J1', 'build', '001', 'ui', 2),
  stagedLaunchedRecord('J2', 'build', '001', 'theme', 2),
  endedRecord('J1', 'failed'),
  endedRecord('J2', 'failed'),
];

function redHandoffResumedRecord(jobId: string, childInstance: number): LogRecord {
  return {
    kind: 'job-resumed', jobId, fields: { childInstance, cause: 'handoff-red' }, at: FIXTURE_AT,
  };
}

/** A stage 1 build spent its red resumes and built; the stage 2 build of the same attempt went red once. */
const RED_HANDOFFS_IN_AN_EARLIER_STAGE: LogRecord[] = [
  stagedLaunchedRecord('J1', 'build', '001', 'shop', 1),
  interruptedRecord('J1', 'handoff-red'),
  redHandoffResumedRecord('J1', 2),
  interruptedRecord('J1', 'handoff-red'),
  redHandoffResumedRecord('J1', 3),
  endedRecord('J1', 'built'),
  stagedLaunchedRecord('J2', 'build', '001', 'ui', 2),
  interruptedRecord('J2', 'handoff-red'),
];

/** A stage 1 build of `shop`, then three reviews that did not hold, each but the last followed by a `shop` rebuild that built. */
const STAGED_BUILD_SENT_BACK_BY_THREE_REVIEWS: LogRecord[] = [
  stagedLaunchedRecord('J1', 'build', '001', 'shop', 1),
  endedRecord('J1', 'built'),
  ...[1, 2, 3].flatMap((review): LogRecord[] => [
    ...finishedJobRecords(`R${review}`, 'review', '001', 'does-not-hold', review),
    ...(review < 3 ? [stagedLaunchedRecord(`B${review}`, 'build', '001', 'shop', 1), endedRecord(`B${review}`, 'built')] : []),
  ]),
];

const RED_INTERRUPTED_STAGE_TWO_BUILD = jobFixture({
  id: 'J2', ticketIds: ['001'], state: 'interrupted', interruption: 'handoff-red', entity: 'ui', stage: 2
});

const JOB_STATES_MODULE = 'src/lib/tracker-model/constants/JobStates.ts';

const RESUME_POLICY_MODULE = 'src/lib/tracker-model/constants/ResumePolicy.ts';

/** One interrupted job of each path `crashBoundStepsOf` and `productOwnerStepsOf` take, with the ticket status its kind runs in. */
const INTERRUPTED_JOBS_OF_EACH_PATH: readonly { job: Job; ticketStatus: TicketStatus }[] = [
  { job: INTERRUPTED_BUILD, ticketStatus: 'in-progress' },
  {
    job: jobFixture({
      id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['001'], state: 'interrupted'
    }),
    ticketStatus: 'in-review',
  },
  { job: { ...LIVE_ASSISTANT, state: 'interrupted' }, ticketStatus: 'in-progress' },
  { job: interruptedPipelineAgentJob(), ticketStatus: 'in-progress' },
  {
    job: jobFixture({
      id: 'J8', kind: 'product-owner', role: 'product-owner', target: null, state: 'interrupted'
    }),
    ticketStatus: 'in-progress',
  },
];

/** `'authentication-failed':`, the table's widest key, sets its alignment. */
const RESUME_POLICY_TABLE_KEY_WIDTH = '\'authentication-failed\':'.length;

/** The row of the resume policy table that gives the cause its policy, rewritten to another policy. */
function policyRowOf(cause: InterruptionCause, policy: ResumePolicy, mutatedPolicy: ResumePolicy): SourceMutant {
  const row = (rowPolicy: ResumePolicy): string => `${`'${cause}':`.padEnd(RESUME_POLICY_TABLE_KEY_WIDTH)} '${rowPolicy}',`;
  return { modulePath: RESUME_POLICY_MODULE, find: row(policy), replace: row(mutatedPolicy) };
}

/** A job that ended on a network outage or a lease end waits for User's resume, whatever its kind; each claim watches the table's row fail. */
function heldInterruptionClaims(): PolicyClaim[] {
  return (['network-outage', 'lease-ended'] as const).flatMap((cause) => INTERRUPTED_JOBS_OF_EACH_PATH.map(({ job, ticketStatus }): PolicyClaim => {
    const heldJob: Job = { ...job, interruption: cause };
    return {
      name:   `a ${heldJob.kind} job interrupted ${cause} is neither resumed nor replaced`,
      facts:  factsWith({ tickets: [ticketOf('001', ticketStatus)], jobs: heldJob.kind === 'assistant' ? [heldJob] : [LIVE_ASSISTANT, heldJob] }),
      holds:  (steps) => !steps.some((step) => 'jobId' in step && step.jobId === heldJob.id),
      mutant: policyRowOf(cause, 'waits-for-instruction', 'resumes-by-itself'),
    };
  }));
}

const REBOOTED_BUILD: Job = { ...INTERRUPTED_BUILD, interruption: 'reboot' };

/** The build's launch and its interruption, then what `after` adds. */
function interruptedBuildLog(cause: InterruptionCause, after: readonly LogRecord[] = []): LogRecord[] {
  return [launchedRecord('J1', 'build', ['001']), interruptedRecord('J1', cause), ...after];
}

function rebootedBuildFacts(after: readonly LogRecord[] = []): PlaybookFacts {
  return factsWith({ tickets: [ticketOf('001', 'in-progress')], jobs: [LIVE_ASSISTANT, REBOOTED_BUILD], logRecords: interruptedBuildLog('reboot', after) });
}

const ANSWER_TO_THE_BUILD_QUESTION: LogRecord = {
  kind: 'decision-answered', decisionId: 'E1', fields: { answer: { 'Carry on?': 'Yes' }, requestId: 'request-1' }, at: FIXTURE_AT,
};

function resumesInstructed(jobId: string): (steps: readonly PlaybookStep[]) => boolean {
  return (steps) => Bun.deepEquals(steps, [{ kind: 'resume-job', jobId, instructed: true }], true);
}

const USAGE_LIMIT_AHEAD: LifecycleLimits = { ...FIXTURE_LIMITS, usageResetsAt: '2026-10-28T11:00:00+01:00' };

/** A hold that keeps every resume, for which an instructed resume of a rebooted build waits as any other. */
const HOLDS_OF_AN_INSTRUCTED_RESUME: readonly { hold: string; facts: Partial<PlaybookFacts>; limits?: LifecycleLimits }[] = [
  { hold: 'a usage limit', facts: {}, limits: USAGE_LIMIT_AHEAD },
  { hold: 'an install change', facts: { observations: { ...FIXTURE_OBSERVATIONS, installVersionChanged: true } } },
  { hold: 'an open outage', facts: { decisions: [decisionOf('outage')] } },
  { hold: 'a missing pipeline', facts: { pipelineIsSet: false, decisions: [decisionOf('checks-not-set')] } },
];

/** Each hold keeps the instructed resume: the instruction stays in the log and is carried out once the hold clears. */
function instructedResumeHoldClaims(): PolicyClaim[] {
  return HOLDS_OF_AN_INSTRUCTED_RESUME.map(({ hold, facts, limits }): PolicyClaim => ({
    name:   `${hold} holds an instructed resume`,
    facts:  { ...rebootedBuildFacts([resumeInstructedRecord('J1')]), ...facts },
    ...(limits === undefined ? {} : { limits }),
    holds:  (steps) => !steps.some((step) => step.kind === 'resume-job'),
    mutant: policyLine(
      '  return resumeIsHeld ? [] : [{ kind: \'resume-job\', jobId: job.id, instructed }];',
      '  return resumeIsHeld && !instructed ? [] : [{ kind: \'resume-job\', jobId: job.id, instructed }];'
    ),
  }));
}

const INTERRUPTED_PRODUCT_OWNER = jobFixture({
  id: 'J8', kind: 'product-owner', role: 'product-owner', target: null, state: 'interrupted', interruption: 'agent-crashed'
});

/** A crashed build after `crashResumes` crash resumes, its crash bound being `CRASH_RESUMES_BEFORE_WAITING`. */
function crashedBuildFacts(crashResumes: number, after: readonly LogRecord[] = []): PlaybookFacts {
  return factsWith({
    tickets:    [ticketOf('001', 'in-progress')],
    jobs:       [LIVE_ASSISTANT, { ...INTERRUPTED_BUILD, interruption: 'agent-crashed', crashResumes }],
    logRecords: interruptedBuildLog('agent-crashed', after),
  });
}

/** The resume policy table's rules, one claim per row the Playbook reads, each watched failing without its line. */
const RESUME_POLICY_CLAIMS: PolicyClaim[] = [
  {
    name:   'a job interrupted by a reboot waits for User\'s resume',
    facts:  rebootedBuildFacts(),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('  if (policy === \'waits-for-instruction\' && !instructed) return [];\n', ''),
  },
  {
    name:   'a job interrupted by a reboot resumes once User asked, as an instructed resume',
    facts:  rebootedBuildFacts([resumeInstructedRecord('J1')]),
    holds:  resumesInstructed('J1'),
    mutant: policyLine('    if (record.kind === \'job-resume-instructed\' && record.jobId === job.id) instructed = true;\n', ''),
  },
  {
    name:   'an instruction logged before the newest interruption does not count: a second interruption waits again',
    facts:  rebootedBuildFacts([resumeInstructedRecord('J1'), interruptedRecord('J1', 'reboot')]),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('    if ((record.kind === \'job-interrupted\' || record.kind === \'job-line-lost\') && record.jobId === job.id) instructed = false;\n', ''),
  },
  {
    name:  'an answer to the question of a job interrupted by a reboot resumes it',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-progress')],
      jobs:       [LIVE_ASSISTANT, { ...REBOOTED_BUILD, answeredRequestIds: ['request-1'] }],
      logRecords: interruptedBuildLog('reboot', [ANSWER_TO_THE_BUILD_QUESTION]),
    }),
    holds:  resumesInstructed('J1'),
    mutant: policyLine(
      '    if (record.kind === \'decision-answered\' && record.fields.requestId !== undefined && answeredRequestIds.has(record.fields.requestId)) instructed = true;\n',
      ''
    ),
  },
  {
    name:   'a crashed job with no crash resume yet is resumed by itself',
    facts:  crashedBuildFacts(0),
    holds:  (steps) => Bun.deepEquals(steps, [{ kind: 'resume-job', jobId: 'J1', instructed: false }], true),
    mutant: policyLine('job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING', 'job.crashResumes >= 0'),
  },
  {
    name:   'a crashed job with one crash resume is resumed by itself',
    facts:  crashedBuildFacts(1),
    holds:  (steps) => Bun.deepEquals(steps, [{ kind: 'resume-job', jobId: 'J1', instructed: false }], true),
    mutant: policyLine('job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING', 'job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING - 1'),
  },
  {
    name:   'a crashed job at its crash bound waits for User\'s resume, never replaced',
    facts:  crashedBuildFacts(FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING', 'job.crashResumes > limits.CRASH_RESUMES_BEFORE_WAITING'),
  },
  {
    name:   'a crashed job at its crash bound resumes once User asked, as an instructed resume',
    facts:  crashedBuildFacts(FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING, [resumeInstructedRecord('J1')]),
    holds:  resumesInstructed('J1'),
    mutant: policyLine('[{ kind: \'resume-job\', jobId: job.id, instructed }]', '[{ kind: \'resume-job\', jobId: job.id, instructed: false }]'),
  },
  {
    name:  'a job interrupted by a network outage resumes once User asked',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-progress')],
      jobs:       [LIVE_ASSISTANT, { ...INTERRUPTED_BUILD, interruption: 'network-outage' }],
      logRecords: interruptedBuildLog('network-outage', [resumeInstructedRecord('J1')]),
    }),
    holds:  resumesInstructed('J1'),
    mutant: policyRowOf('network-outage', 'waits-for-instruction', 'never-resumes'),
  },
  ...instructedResumeHoldClaims(),
  {
    name:   'a product owner past its crash bound with no question open waits for User\'s resume',
    facts:  factsWith({ jobs: [LIVE_ASSISTANT, { ...INTERRUPTED_PRODUCT_OWNER, crashResumes: FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING }] }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('  if (policy === \'waits-for-instruction\' && !instructed) return [];\n', ''),
  },
  {
    name:  'a product owner past its crash bound with a question open waits for the answer with no process',
    facts: factsWith({
      jobs:      [LIVE_ASSISTANT, { ...INTERRUPTED_PRODUCT_OWNER, crashResumes: FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING }],
      decisions: [{
        id: 'E1', kind: 'agent-question', ticketIds: [], jobId: 'J8', askedBy: 'product-owner', requestId: 'request-1', questions: [], context: '', openedAt: FIXTURE_AT
      }],
    }),
    holds:  (steps) => Bun.deepEquals(steps, [{ kind: 'await-answer', jobId: 'J8' }], true),
    mutant: policyLine('  if (crashResumesAreSpent(job, limits) && awaitsAnAnswer) return [{ kind: \'await-answer\', jobId: job.id }];\n', ''),
  },
  {
    name:   'an Assistant interrupted by a reboot is still replaced',
    facts:  factsWith({ jobs: [{ ...LIVE_ASSISTANT, state: 'interrupted', interruption: 'reboot' }] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'replace-job',
    mutant: policyLine('[\'reboot\', \'forge-stopped\', \'forge-crashed\']', '[\'forge-stopped\', \'forge-crashed\']'),
  },
];

const CLAIMS: PolicyClaim[] = [
  {
    name:   'a resume comes before any launch',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress'), ticketOf('002', 'committed')], jobs: [LIVE_ASSISTANT, INTERRUPTED_BUILD] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job launch-build',
    mutant: policyLine('  steps.push(...crashBoundStepsOf(facts, limits, { resumesAreHeld, pipelineAgentResumesAreHeld: versionOrUsageHolds || outageHolds }));', ''),
  },
  {
    name:   'a review goes ahead of a ready build of its own rank',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed'), ticketOf('002', 'in-review')], concurrencyLimit: 1 }),
    holds:  launchesExactly(['002']),
    mutant: policyLine('review: 0, stage: 1, rebuild: 2, build: 3', 'review: 4, stage: 1, rebuild: 2, build: 3'),
  },
  {
    name:  'a rebuild goes ahead of a ready build of its own rank',
    facts: factsWith({
      tickets:          [ticketOf('001', 'committed'), ticketOf('002', 'in-progress')],
      logRecords:       finishedJobRecords('J1', 'build', '002', 'failed'),
      concurrencyLimit: 1,
    }),
    holds:  (steps) => steps.some((step) => step.kind === 'launch-build' && step.ticketId === '002' && step.attempt === 2) && launchedTicketIdsOf(steps).length === 1,
    mutant: policyLine('review: 0, stage: 1, rebuild: 2, build: 3', 'review: 0, stage: 1, rebuild: 4, build: 3'),
  },
  {
    name:   'a review never goes ahead of a ready build of a higher rank',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed', { priority: 'high' }), ticketOf('002', 'in-review')], concurrencyLimit: 1 }),
    holds:  launchesExactly(['001']),
    mutant: policyLine('    rankOf(a) - rankOf(b)\n', '    0\n'),
  },
  {
    name:  'within a rank the ticket readied first launches first',
    facts: factsWith({
      tickets:                     [ticketOf('002', 'committed'), ticketOf('003', 'committed')],
      readinessPositionByTicketId: new Map([['002', 5], ['003', 1]]),
      concurrencyLimit:            1,
    }),
    holds:  launchesExactly(['003']),
    mutant: policyLine('    || readinessOf(a) - readinessOf(b)\n', ''),
  },
  {
    name:   'with readiness equal the lower id launches first',
    facts:  factsWith({ tickets: [ticketOf('010', 'committed'), ticketOf('009', 'committed')], concurrencyLimit: 1 }),
    holds:  launchesExactly(['009']),
    mutant: policyLine('Number(a.ticket.id) - Number(b.ticket.id)', 'Number(b.ticket.id) - Number(a.ticket.id)'),
  },
  {
    name:   'a held committed ticket is not ready',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed', { hold: 'by User' })] }),
    holds:  launchesExactly([]),
    mutant: policyLine('  if (ticket.hold !== undefined || ticket.mergeQueued === true) return true;\n', '  if (ticket.mergeQueued === true) return true;\n'),
  },
  {
    name:   'a ticket its passed review queued to merge gets no second review',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-review', { mergeQueued: true })] }),
    holds:  launchesExactly([]),
    mutant: policyLine('  if (ticket.hold !== undefined || ticket.mergeQueued === true) return true;\n', '  if (ticket.hold !== undefined) return true;\n'),
  },
  {
    name:  'an open waiver or agent-config decision naming a ticket holds every launch on it',
    facts: factsWith({
      tickets:   [ticketOf('001', 'in-review')],
      decisions: [{
        id: 'E1', kind: 'waiver', ticketIds: ['001'], jobId: null, askedBy: 'reviewer', requestId: null, questions: [], context: '', openedAt: FIXTURE_AT
      }],
    }),
    holds:  launchesExactly([]),
    mutant: policyLine(
      '  if (facts.decisions.some((decision) => TICKET_HOLDING_DECISION_KINDS.includes(decision.kind) && decision.ticketIds.includes(ticket.id))) return true;\n',
      '',
    ),
  },
  {
    name:  'a review awaiting its waiver answer that User answered is acted on with the answer, and nothing launches on its ticket',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-review')],
      jobs:       [LIVE_ASSISTANT, WAITING_REVIEW],
      logRecords: [launchedRecord('J3', 'review', ['001']), ...WAIVER_OPENED_AND_ANSWERED],
    }),
    holds:  (steps) => JSON.stringify(steps) === JSON.stringify([{ kind: 'act-on-waiver-answer', jobId: 'J3', answers: ['Grant'] }]),
    mutant: policyLine('  steps.push(...waiverAnswerStepsOf(facts));\n', ''),
  },
  {
    name:  'a review whose newest waiver decision is still open waits for its answer, whatever an earlier one was answered',
    facts: factsWith({
      tickets:   [ticketOf('001', 'in-review')],
      jobs:      [LIVE_ASSISTANT, WAITING_REVIEW],
      decisions: [{
        ...decisionOf('waiver'), id: 'E2', ticketIds: ['001'], jobId: 'J3'
      }],
      logRecords: [
        launchedRecord('J3', 'review', ['001']),
        ...WAIVER_OPENED_AND_ANSWERED,
        {
          kind: 'decision-opened', decisionId: 'E2', fields: { kind: 'waiver', ticketIds: ['001'] }, at: FIXTURE_AT
        },
      ],
    }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('      answers = null;\n', ''),
  },
  {
    name:  'a waiver answered before the review launched is not its answer',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-review')],
      jobs:       [LIVE_ASSISTANT, WAITING_REVIEW],
      logRecords: [...WAIVER_OPENED_AND_ANSWERED, launchedRecord('J3', 'review', ['001'])],
    }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('    if (!launched) continue;\n', ''),
  },
  {
    name:   'a committed ticket waits for its dependencies to be reviewed or delivered',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress'), ticketOf('002', 'committed', { dependsOn: ['001'] })] }),
    holds:  launchesExactly([]),
    mutant: policyLine('  if (TicketDependencyUtil.unsettledDependenciesOf(ticket.dependsOn ?? [], statusById).length > 0) return null;\n', ''),
  },
  {
    name:   'a group ticket builds from its group branch',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed', { group: 'lifecycle' })] }),
    holds:  (steps) => steps.some((step) => step.kind === 'launch-build' && step.base === 'group-lifecycle'),
    mutant: policyLine('`${observations.groupTargetPrefix}${ticket.group}`', 'observations.mainLine'),
  },
  {
    name:  'a ticket with a live job gets no second one',
    facts: factsWith({
      tickets: [ticketOf('001', 'committed')],
      jobs:    [LIVE_ASSISTANT, jobFixture({
        id: 'J1', ticketIds: ['001'], kind: 'merge', role: null
      })]
    }),
    holds:  launchesExactly([]),
    mutant: policyLine('!ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob(ticket.id, facts) && ', '!ticketIdsSettledThisPass.has(ticket.id) && '),
  },
  {
    name:  'a job waiting for an answer keeps its slot',
    facts: factsWith({
      tickets:          [ticketOf('001', 'in-progress'), ticketOf('002', 'committed'), ticketOf('003', 'committed')],
      jobs:             [LIVE_ASSISTANT, jobFixture({ id: 'J1', ticketIds: ['001'], state: 'waiting-for-answer' })],
      concurrencyLimit: 2,
    }),
    holds:  launchesExactly(['002']),
    mutant: launchSlotLine('SLOT_TAKING_JOB_KINDS.includes(job.kind);', 'SLOT_TAKING_JOB_KINDS.includes(job.kind) && job.state !== \'waiting-for-answer\';'),
  },
  {
    name:  'a ticket whose ended job left its question open launches nothing until User answers',
    facts: factsWith({
      tickets:   [ticketOf('001', 'in-review')],
      decisions: [{
        id: 'E1', kind: 'agent-question', ticketIds: ['001'], jobId: null, askedBy: 'builder', requestId: 'request-1', questions: [], context: '', openedAt: FIXTURE_AT
      }],
    }),
    holds:  launchesExactly([]),
    mutant: policyLine('decision.kind === \'agent-question\' && decision.jobId === null && ', 'decision.kind === \'never\' && '),
  },
  {
    name:  'an interrupted job whose question is open resumes only once it is answered, so the resume carries the answer',
    facts: factsWith({
      tickets: [ticketOf('001', 'in-progress')],
      jobs:    [LIVE_ASSISTANT, jobFixture({
        id: 'J1', ticketIds: ['001'], state: 'interrupted', interruption: 'talos-paused'
      })],
      decisions: [{
        id: 'E1', kind: 'agent-question', ticketIds: ['001'], jobId: 'J1', askedBy: 'builder', requestId: 'request-1', questions: [], context: '', openedAt: FIXTURE_AT
      }],
    }),
    holds:  (steps) => !steps.some((step) => step.kind === 'resume-job'),
    mutant: policyLine(
      '    return resumeStepsOf(job, facts, limits, resumesAreHeld || jobResumeIsHeld(job, facts) || jobAwaitsAnAnswer(job, facts));',
      '    return resumeStepsOf(job, facts, limits, resumesAreHeld || jobResumeIsHeld(job, facts));'
    ),
  },
  {
    name:   'an Assistant job takes no slot',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed')], concurrencyLimit: 1 }),
    holds:  launchesExactly(['001']),
    mutant: launchSlotLine('= [\'build\', \'review\'];', '= [\'build\', \'review\', \'assistant\'];'),
  },
  {
    name:   'launches stop at the concurrency limit',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed'), ticketOf('002', 'committed')], concurrencyLimit: 1 }),
    holds:  launchesExactly(['001']),
    mutant: policyLine('    .slice(0, freeSlotsOf(facts));\n', ';\n'),
  },
  {
    name:  'launches stop at the machine slots reserved, and each other launchable ticket waits for a machine slot',
    facts: factsWith({
      tickets:          [ticketOf('001', 'committed'), ticketOf('002', 'committed')],
      concurrencyLimit: 2,
      observations:     { ...FIXTURE_OBSERVATIONS, machineAgentSlotsFree: 1 },
    }),
    holds:  (steps) => launchesExactly(['001'])(steps) && steps.some((step) => step.kind === 'await-machine-slot' && step.ticketId === '002'),
    mutant: policyLine('index < machineSlotsFree', 'index <= machineSlotsFree'),
  },
  {
    name:   'a job interrupted by a usage limit resumes whatever its crash count',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], jobs: [LIVE_ASSISTANT, { ...INTERRUPTED_BUILD, interruption: 'usage-limit', crashResumes: 5 }] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job',
    mutant: policyLine('return isCrash(job.interruption ?? UNRECORDED_INTERRUPTION_CAUSE) && job.crashResumes', 'return job.crashResumes'),
  },
  {
    name:   'a session that went down is replaced, never resumed',
    facts:  factsWith({ jobs: [{ ...LIVE_ASSISTANT, state: 'interrupted', interruption: 'watcher-lost' }] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'replace-job',
    mutant: policyLine('    if (REPLACED_SESSION_JOB_KINDS.includes(job.kind)) {\n', '    if (false) {\n'),
  },
  ...heldInterruptionClaims(),
  ...RESUME_POLICY_CLAIMS,
  {
    name:   'a job interrupted by a clean quit of Talos resumes whatever its crash count',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], jobs: [LIVE_ASSISTANT, { ...INTERRUPTED_BUILD, interruption: 'talos-paused', crashResumes: 5 }] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job',
    mutant: {
      modulePath: JOB_STATES_MODULE,
      find:       '= [\'watcher-lost\', \'agent-crashed\'] as const',
      replace:    '= [\'watcher-lost\', \'agent-crashed\', \'talos-paused\'] as const',
    },
  },
  {
    name:   'the second failed pass parks the ticket, rework between them kept, and opens no incident',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: TWO_FAILED_PASSES_WITH_REWORK_BETWEEN }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'park',
    mutant: policyLine('>= limits.FAILED_PASSES_BEFORE_PARKING', '> limits.FAILED_PASSES_BEFORE_PARKING'),
  },
  {
    name:   'a review that does not hold is a failed pass',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: TWO_FAILED_PASSES_WITH_REWORK_BETWEEN }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'park',
    mutant: { modulePath: FAILED_PASS_MODULE, find: '[\'failed\', \'does-not-hold\']', replace: '[\'failed\']' },
  },
  {
    name:   'a start from review is rework and keeps the failed passes',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: TWO_FAILED_PASSES_WITH_REWORK_BETWEEN }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'park',
    mutant: { modulePath: FAILED_PASS_MODULE, find: 'record.kind === \'ticket-started\' && !ticketIsInReview', replace: 'record.kind === \'ticket-started\'' },
  },
  {
    name:   'unholding a ticket starts its failed passes again, so it rebuilds',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: [...TWO_FAILED_PASSES_WITH_REWORK_BETWEEN, ticketRecord('ticket-unheld', '001')] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'launch-build',
    mutant: { modulePath: FAILED_PASS_MODULE, find: '    if (record.kind === \'ticket-unheld\') failedPassesByStage.clear();\n', replace: '' },
  },
  {
    name:   'a stage that starts again counts its failed passes from zero',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: FAILED_PASSES_IN_TWO_ENTRIES_OF_A_STAGE }),
    holds:  (steps) => !stepKindsOf(steps).includes('park'),
    mutant: {
      modulePath: FAILED_PASS_MODULE,
      find:       '      if (ticketHasCrossed && launchStage !== undefined && launchStage !== currentStage) failedPassesByStage.clear();\n',
      replace:    '',
    },
  },
  {
    name:   'two entities of one stage count their failed passes apart',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: FAILED_PASSES_IN_TWO_ENTITIES_OF_A_STAGE }),
    holds:  (steps) => !stepKindsOf(steps).includes('park'),
    mutant: { modulePath: FAILED_PASS_MODULE, find: ' ? \'\' : `${launch.entity ?? \'\'}/${launch.stage ?? \'\'}`', replace: ' ? \'\' : \'\'' },
  },
  {
    name:   'a red handoff counts only the resumes of its own entity and stage',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], jobs: [LIVE_ASSISTANT, RED_INTERRUPTED_STAGE_TWO_BUILD], logRecords: RED_HANDOFFS_IN_AN_EARLIER_STAGE }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job',
    mutant: policyLine('\n      && FailedPassUtil.stageKeyOf(launch) === FailedPassUtil.stageKeyOf(cycle);', ';'),
  },
  {
    name:   'a staged build sent back by reviews past its red resumes parks red-resumes-spent',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: STAGED_BUILD_SENT_BACK_BY_THREE_REVIEWS }),
    holds:  (steps) => JSON.stringify(steps) === JSON.stringify([{ kind: 'park', ticketId: '001', cause: 'red-resumes-spent' }]),
    mutant: policyLine('    ...(newestBuild?.entity === undefined ? {} : { entity: newestBuild.entity }),\n', ''),
  },
  {
    name:   'a ticket parked in this pass does not launch in it',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], logRecords: TWO_FAILED_PASSES_WITH_REWORK_BETWEEN }),
    holds:  launchesExactly([]),
    mutant: policyLine('!ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob', '!ticketHasAJob'),
  },
  {
    name:   'two crashed jobs on different tickets pause the Overseer and open the outage decision',
    facts:  factsWith({ logRecords: CRASHES_ON_TWO_TICKETS }),
    holds:  (steps) => stepKindsOf(steps).slice(0, 2).join(' ') === 'pause-overseer open-decision',
    mutant: policyLine('>= limits.CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING', '> limits.CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING'),
  },
  {
    name:   'two crashes on one ticket are no outage',
    facts:  factsWith({ logRecords: [launchedRecord('J1', 'build', ['001']), interruptedRecord('J1', 'watcher-lost'), interruptedRecord('J1', 'watcher-lost')] }),
    holds:  (steps) => !stepKindsOf(steps).includes('pause-overseer'),
    mutant: policyLine('crashedTicketKeys.at(-1) === ticketKey ? [ticketKey] : [...crashedTicketKeys, ticketKey]', '[...crashedTicketKeys, ticketKey]'),
  },
  {
    name:   'reboots are never counted toward an outage',
    facts:  factsWith({ logRecords: [...CRASHES_ON_TWO_TICKETS.slice(0, 2), interruptedRecord('J1', 'reboot'), interruptedRecord('J2', 'reboot')] }),
    holds:  (steps) => !stepKindsOf(steps).includes('pause-overseer'),
    mutant: policyLine('record.kind !== \'job-interrupted\' || !isCrash(record.fields.cause)', 'record.kind !== \'job-interrupted\''),
  },
  {
    name:   'a network outage and a lease end are never counted toward an outage',
    facts:  factsWith({ logRecords: [...CRASHES_ON_TWO_TICKETS.slice(0, 2), interruptedRecord('J1', 'network-outage'), interruptedRecord('J2', 'lease-ended')] }),
    holds:  (steps) => !stepKindsOf(steps).includes('pause-overseer'),
    mutant: {
      modulePath: JOB_STATES_MODULE,
      find:       '= [\'watcher-lost\', \'agent-crashed\'] as const',
      replace:    '= [\'watcher-lost\', \'agent-crashed\', \'network-outage\', \'lease-ended\'] as const',
    },
  },
  {
    name:  'a network outage or a lease end between two crashes breaks no run',
    facts: factsWith({
      logRecords: [
        ...CRASHES_ON_TWO_TICKETS.slice(0, 3),
        launchedRecord('J3', 'build', ['003']),
        launchedRecord('J4', 'build', ['004']),
        interruptedRecord('J3', 'network-outage'),
        interruptedRecord('J4', 'lease-ended'),
        interruptedRecord('J2', 'watcher-lost'),
      ],
    }),
    holds:  (steps) => stepKindsOf(steps).slice(0, 2).join(' ') === 'pause-overseer open-decision',
    mutant: policyLine(
      '    if (record.kind !== \'job-interrupted\' || !isCrash(record.fields.cause)) continue;\n',
      '    if (record.kind === \'job-interrupted\' && !isCrash(record.fields.cause)) crashedTicketKeys = [];\n'
        + '    if (record.kind !== \'job-interrupted\' || !isCrash(record.fields.cause)) continue;\n',
    ),
  },
  {
    name:   'a verified job ending between two crashes breaks the run',
    facts:  factsWith({ logRecords: [...CRASHES_ON_TWO_TICKETS.slice(0, 3), ...finishedJobRecords('J3', 'build', '003', 'built'), interruptedRecord('J2', 'watcher-lost')] }),
    holds:  (steps) => !stepKindsOf(steps).includes('pause-overseer'),
    mutant: policyLine('    if (record.kind === \'job-ended\' && VERIFIED_OUTCOMES.includes(record.fields.outcome)) crashedTicketKeys = [];\n', ''),
  },
  {
    name:  'the outage opens once for the crashes that opened it',
    facts: factsWith({
      logRecords: [...CRASHES_ON_TWO_TICKETS, {
        kind: 'decision-opened', decisionId: 'E1', fields: { kind: 'outage', ticketIds: [] }, at: FIXTURE_AT
      }]
    }),
    holds:  (steps) => !stepKindsOf(steps).includes('pause-overseer'),
    mutant: policyLine('    if (record.kind === \'decision-opened\' && record.fields.kind === \'outage\') crashedTicketKeys = [];\n', ''),
  },
  {
    name:   'an open outage decision holds resumes',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress')], jobs: [LIVE_ASSISTANT, INTERRUPTED_BUILD], decisions: [decisionOf('outage')] }),
    holds:  (steps) => !stepKindsOf(steps).includes('resume-job'),
    mutant: policyLine(' || openDecisionOfKind(facts, \'outage\')', ''),
  },
  {
    name:   'a paused board resumes interrupted jobs but launches nothing new',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress'), ticketOf('002', 'committed')], jobs: [LIVE_ASSISTANT, INTERRUPTED_BUILD], overseerState: 'paused' }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job',
    mutant: policyLine('resumesAreHeld || facts.overseerState === \'paused\'', 'resumesAreHeld'),
  },
  {
    name:  'two replaced jobs in a row on one ticket open a job-lost incident defaulting to park',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-progress')],
      logRecords: [...finishedJobRecords('J1', 'build', '001', 'replaced'), ...finishedJobRecords('J2', 'build', '001', 'replaced', 2)],
    }),
    holds: (steps) => launchedTicketIdsOf(steps).length === 0
      && steps.some((step) => step.kind === 'open-incident' && step.incident.kind === 'job-lost' && step.incident.defaultMove === 'ticket-park'),
    mutant: policyLine('>= limits.REPLACED_JOBS_BEFORE_JOB_LOST', '> limits.REPLACED_JOBS_BEFORE_JOB_LOST'),
  },
  {
    name:  'an open job-lost incident holds the ticket',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-progress')],
      logRecords: finishedJobRecords('J1', 'build', '001', 'replaced'),
      incidents:  [incidentOf({ kind: 'job-lost', ticketIds: ['001'] })],
    }),
    holds:  launchesExactly([]),
    mutant: policyLine('  return facts.incidents.some((incident) => incident.ticketIds.includes(ticket.id));', '  return false;'),
  },
  {
    name:   'with no checks line nothing launches, no pipeline agent either, and one checks-not-set decision opens',
    facts:  factsWith({ tickets: [ticketOf('001', 'committed')], pipelineIsSet: false }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'open-decision',
    mutant: policyLine(' || !facts.pipelineIsSet', ''),
  },
  {
    name:   'an open checks-not-set decision is not opened again',
    facts:  factsWith({ pipelineIsSet: false, decisions: [decisionOf('checks-not-set')], jobs: [LIVE_ASSISTANT, pipelineAgentJob()] }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine(' && !openDecisionOfKind(facts, \'checks-not-set\')', ''),
  },
  {
    name:  'an interrupted pipeline agent resumes with no pipeline stored and on a paused board',
    facts: factsWith({
      pipelineIsSet: false, overseerState: 'paused', decisions: [decisionOf('checks-not-set')], jobs: [LIVE_ASSISTANT, interruptedPipelineAgentJob()]
    }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'resume-job',
    mutant: policyLine('    if (job.kind === \'pipeline-agent\') return resumeStepsOf(job, facts, limits, holds.pipelineAgentResumesAreHeld);\n', ''),
  },
  {
    name:   'a usage limit holds the resume of an interrupted pipeline agent',
    facts:  factsWith({ pipelineIsSet: false, decisions: [decisionOf('checks-not-set')], jobs: [LIVE_ASSISTANT, interruptedPipelineAgentJob()] }),
    limits: USAGE_LIMIT_AHEAD,
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('pipelineAgentResumesAreHeld: versionOrUsageHolds || outageHolds', 'pipelineAgentResumesAreHeld: false'),
  },
  {
    name:   'an open pipeline-proposal decision of an earlier release is withdrawn at the next pass',
    facts:  factsWith({ decisions: [{ ...decisionOf('pipeline-proposal'), id: 'E4', jobId: 'J7' }] }),
    holds:  (steps) => steps.some((step) => step.kind === 'withdraw-retired-decision' && step.decisionId === 'E4'),
    mutant: policyLine('.filter((decision) => decision.kind === \'pipeline-proposal\')', '.filter(() => false)'),
  },
  {
    name:   'a usage limit holds launches and resumes until its reset',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-progress'), ticketOf('002', 'committed')], jobs: [LIVE_ASSISTANT, INTERRUPTED_BUILD] }),
    limits: USAGE_LIMIT_AHEAD,
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('limits.usageResetsAt !== null && Date.parse(limits.now) < Date.parse(limits.usageResetsAt)', 'false'),
  },
  {
    name:  'a changed install version holds launches and resumes',
    facts: factsWith({
      tickets:      [ticketOf('001', 'in-progress'), ticketOf('002', 'committed')],
      jobs:         [LIVE_ASSISTANT, INTERRUPTED_BUILD],
      observations: { ...FIXTURE_OBSERVATIONS, installVersionChanged: true },
    }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('usageLimitHolds(limits) || facts.observations.installVersionChanged', 'usageLimitHolds(limits)'),
  },
  {
    name:   'a branch that touched agent configuration launches nothing',
    facts:  factsWith({ tickets: [ticketOf('001', 'in-review')], observations: { ...FIXTURE_OBSERVATIONS, ticketIdsTouchingAgentConfig: ['001'] } }),
    holds:  launchesExactly([]),
    mutant: policyLine('  if (facts.observations.ticketIdsTouchingAgentConfig.includes(ticket.id)) return true;\n', ''),
  },
  {
    name:   'with no Assistant live one boots',
    facts:  factsWith({ jobs: [] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'boot-assistant',
    mutant: policyLine(' steps.push({ kind: \'boot-assistant\' });', ' steps.push();'),
  },
  {
    name:  'after two failed boots no Assistant boots and every open incident takes its default',
    facts: factsWith({
      jobs:       [],
      incidents:  [incidentOf({})],
      logRecords: [launchedRecord('J1', 'assistant', []), endedRecord('J1', 'failed'), launchedRecord('J2', 'assistant', []), endedRecord('J2', 'failed')],
    }),
    holds:  (steps) => steps.length === 1 && steps[0]?.kind === 'default-incident' && steps[0].cause === 'no-assistant',
    mutant: policyLine('>= limits.FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING', '> limits.FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING'),
  },
  {
    name:  'an incident delivered in a closed turn takes its default',
    facts: factsWith({
      incidents:    [incidentOf({ deliveredInTurn: { jobId: 'J900', chatSequence: 3 } })],
      observations: { ...FIXTURE_OBSERVATIONS, closedDeliveryTurns: [{ jobId: 'J900', chatSequence: 3 }] },
    }),
    holds:  (steps) => steps.length === 1 && steps[0]?.kind === 'default-incident' && steps[0].cause === 'turn-closed',
    mutant: policyLine('  return facts.observations.closedDeliveryTurns.some(', '  return false && facts.observations.closedDeliveryTurns.some('),
  },
  {
    name:   'an incident delivered to an Assistant that is gone takes its default',
    facts:  factsWith({ incidents: [incidentOf({ deliveredInTurn: { jobId: 'J7', chatSequence: 1 } })] }),
    holds:  (steps) => stepKindsOf(steps).join(' ') === 'default-incident',
    mutant: policyLine('  if (!facts.jobs.some((job) => job.id === turn.jobId)) return true;\n', ''),
  },
  {
    name:   'an undelivered incident keeps waiting',
    facts:  factsWith({ incidents: [incidentOf({})] }),
    holds:  (steps) => steps.length === 0,
    mutant: policyLine('  if (turn === null) return false;\n', '  if (turn === null) return true;\n'),
  },
  {
    name:  'a review after a granted round is the next round',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-review')],
      logRecords: [ticketRecord('ticket-finished', '001'), ...finishedJobRecords('J1', 'review', '001', 'round-granted')],
    }),
    holds:  (steps) => steps.some((step) => step.kind === 'launch-review' && step.round === 2),
    mutant: policyLine('grantedRounds += 1', 'grantedRounds += 0'),
  },
];

describe('each lifecycle rule holds as written', () => {
  test.each(CLAIMS.map((claim) => [claim.name, claim] as const))('%s', (_name, claim) => {
    expect(holdsUnder(Playbook.nextStepsOf, claim)).toBe(true);
  });
});

describe('each lifecycle rule fails under the mutant of its line', () => {
  test.each(CLAIMS.map((claim) => [claim.name, claim] as const))('%s', async (_name, claim) => {
    const mutated = await mutatedModuleOf(POLICY_MODULE, claim.mutant);
    const policy  = mutated['Playbook'] as typeof Playbook;
    expect(holdsUnder(policy.nextStepsOf, claim)).toBe(false);
  });
});
