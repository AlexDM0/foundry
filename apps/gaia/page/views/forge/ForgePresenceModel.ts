/**
 * What the forge route shows under its bar of how the forge is present (decisions 13, 14, 21, 38, 39): the alert of a forge that crashed,
 * is down or stopped supervising its agents, with the registry's crash summary and Start where the forge's Overseer is gone; the crash logs
 * a forge that serves again lists, each read when User opens it; and the work that waits, each job's cause and what it waits for, a Resume
 * per job that waits for an instruction, and one Resume all. Gaia starts and resumes nothing by itself.
 */
import type { CommandBody }      from '../../@types/CommandDocument.ts';
import type { CrashLogDocument } from '../../@types/CrashLogDocument.ts';
import type {
  FleetDocumentCrashLogEntry,
  FleetDocumentForge,
  FleetDocumentInterruptionCause,
  FleetDocumentResumeWait,
  FleetDocumentWaitingJob,
} from '../../@types/FleetDocument.ts';
import type { ClockReading } from '../../shared/@types/ClockReading.ts';
import { StampTextUtil }     from '../../shared/utils/StampTextUtil.ts';

export interface PresenceAlert {
  readonly title:       string;
  readonly sentence:    string;
  /** "Suspected crash before a reboot" where the registry says so. */
  readonly suspected:   string | null;
  /** The crashed component and its error, set in mono; `null` when the registry holds none. */
  readonly machineLine: string | null;
  /** Start, the user's own start, for a forge whose Overseer is gone; `null` for one that answers. */
  readonly start:       CommandBody | null;
}

export interface WaitingJobLine {
  readonly jobId:     string;
  readonly kind:      string;
  readonly ticketIds: string;
  readonly cause:     string;
  readonly waitsFor:  string;
  /** A Resume only for a job that waits for an instruction; another waits for something no resume gives. */
  readonly resume:    CommandBody | null;
}

export interface CrashLogLine {
  readonly crashLogNumber: number;
  readonly title:          string;
  readonly recordedAt:     string;
}

export interface ForgePresenceContent {
  readonly alert:       PresenceAlert | null;
  readonly crashLogs:   readonly CrashLogLine[];
  readonly waitingWork: readonly WaitingJobLine[];
  /** One Resume all while any work waits; the forge says what it resumed. */
  readonly resumeAll:   CommandBody | null;
}

/** A crash log as the route shows it once read: its error, the jobs that were active and the tail of the forge's log. */
export interface CrashLogShown {
  readonly heading:    string;
  readonly errorLine:  string | null;
  readonly stack:      string | null;
  /** `null` when the forge could not read its board at the crash, never shown as no jobs. */
  readonly activeJobs: readonly string[] | null;
  readonly logTail:    readonly string[] | null;
}

const MACHINE_SEPARATOR = ' · ';

const SUSPECTED_CRASH = 'Suspected crash before a reboot';

const ALERT_TEXTS = {
  crashed: { title: 'Forge crashed', sentence: 'It stays off until it is started. Nothing runs until then.' },
  down:    { title: 'Forge is down', sentence: 'Its Overseer does not answer: it is gone, or hung so that it does not answer.' },
  hung:    { title: 'Not supervised', sentence: 'The forge stopped supervising its agents. They stopped at the end of their turn and wait for a resume.' },
} as const;

/** The cause in words; an agent that crashed waits only once its two automatic restarts are spent. */
const CAUSE_WORDS: Readonly<Record<FleetDocumentInterruptionCause, string>> = {
  'child-lost':            'Supervision lost',
  'agent-crashed':         'Agent crashed',
  'reboot':                'Machine went down',
  'answer-delivery':       'Answer not delivered',
  'usage-limit':           'Usage limit reached',
  'handoff-red':           'Handoff failed',
  'forced-stop-refused':   'Stop refused',
  'authentication-failed': 'Sign-in failed',
  'talos-paused':          'Paused by Talos',
  'lease-ended':           'Not supervised: the forge stopped supervising this agent',
  'network-outage':        'Network outage',
  'forge-stopped':         'Forge stopped',
  'forge-crashed':         'Forge crashed',
};

const AGENT_CRASHED_TWICE = 'Agent crashed twice';

const WAIT_WORDS: Readonly<Record<FleetDocumentResumeWait, string>> = {
  instruction: 'waits for a resume',
  answer:      'waits for an answer',
  decision:    'waits for a decision',
  nothing:     'resumes by itself',
  never:       'no resume restarts it',
};

const CRASHED_COMPONENT_WORDS: Readonly<Record<FleetDocumentCrashLogEntry['component'], string>> = {
  hephaestus: 'Overseer',
  talos:      'Talos',
  unknown:    'Forge',
};

const UNREAD_JOBS = 'The board could not be read at the crash.';

function crashMachineLineOf(forge: FleetDocumentForge): string | null {
  const { crashSummary } = forge;
  if (crashSummary === null) return null;
  const error = [crashSummary.errorName, crashSummary.errorMessage].filter((part) => part !== null).join(': ');
  return [crashSummary.component, error === '' ? null : error].filter((part) => part !== null).join(MACHINE_SEPARATOR);
}

function alertOf(forge: FleetDocumentForge): PresenceAlert | null {
  const { state } = forge.presence;
  if (state !== 'crashed' && state !== 'down' && state !== 'hung') return null;
  const texts = ALERT_TEXTS[state];
  return {
    title:       texts.title,
    sentence:    texts.sentence,
    suspected:   state === 'crashed' && forge.crashSummary?.suspected === true ? SUSPECTED_CRASH : null,
    machineLine: state === 'crashed' ? crashMachineLineOf(forge) : null,
    start:       state === 'hung' ? null : { kind: 'forge-start', trackerId: forge.trackerId },
  };
}

function causeWordsOf(job: FleetDocumentWaitingJob): string {
  return job.cause === 'agent-crashed' && job.waitsFor === 'instruction' ? AGENT_CRASHED_TWICE : CAUSE_WORDS[job.cause];
}

function waitingJobLineOf(trackerId: string, job: FleetDocumentWaitingJob): WaitingJobLine {
  return {
    jobId:     job.jobId,
    kind:      job.kind,
    ticketIds: job.ticketIds.map((ticketId) => `#${ticketId}`).join(' '),
    cause:     causeWordsOf(job),
    waitsFor:  WAIT_WORDS[job.waitsFor],
    resume:    job.waitsFor === 'instruction' ? { kind: 'forge-interrupted-work-resume', trackerId, target: { jobId: job.jobId } } : null,
  };
}

function crashLogTitleOf(entry: FleetDocumentCrashLogEntry): string {
  const crashed = `${CRASHED_COMPONENT_WORDS[entry.component]} crashed`;
  return entry.suspected ? `${SUSPECTED_CRASH}: ${crashed}` : crashed;
}

/** Newest first: the log of the crash just recovered from leads. */
function crashLogLinesOf(forge: FleetDocumentForge, clock: ClockReading): CrashLogLine[] {
  return [...forge.crashLogs].reverse().map((entry) => ({
    crashLogNumber: entry.number,
    title:          crashLogTitleOf(entry),
    recordedAt:     StampTextUtil.clockTextAtReadingOf(entry.recordedAt, clock) ?? entry.recordedAt,
  }));
}

function presenceContentOf(forge: FleetDocumentForge, clock: ClockReading): ForgePresenceContent {
  const waitingWork = forge.waitingWork.map((job) => waitingJobLineOf(forge.trackerId, job));
  return {
    alert:     alertOf(forge),
    crashLogs: crashLogLinesOf(forge, clock),
    waitingWork,
    resumeAll: waitingWork.length === 0 ? null : { kind: 'forge-interrupted-work-resume', trackerId: forge.trackerId, target: 'all' },
  };
}

function presenceIsQuiet(content: ForgePresenceContent): boolean {
  return content.alert === null && content.crashLogs.length === 0 && content.waitingWork.length === 0;
}

function crashLogShownOf(crashLog: CrashLogDocument): CrashLogShown {
  const { error, activeJobs } = crashLog;
  return {
    heading:    `Crash log ${crashLog.number}${crashLog.suspected ? ` · ${SUSPECTED_CRASH}` : ''}`,
    errorLine:  error === null ? null : `${error.name}: ${error.message}`,
    stack:      error?.stack ?? null,
    activeJobs: activeJobs === null ? null : activeJobs.map((job) => [job.jobId, job.kind, job.state, job.interruption, ...job.ticketIds.map((ticketId) => `#${ticketId}`)]
      .filter((part) => part !== null)
      .join(MACHINE_SEPARATOR)),
    logTail: crashLog.logTail,
  };
}

export const ForgePresenceModel = {
  UNREAD_JOBS,
  presenceContentOf,
  presenceIsQuiet,
  crashLogShownOf,
} as const;
