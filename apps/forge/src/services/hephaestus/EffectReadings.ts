/**
 * Effect readings: what a document version names in the main line's tree, read by an `effect-reading` job outside the agent slots, one at
 * a time per board. Hephaestus keeps the newest reading of each ticket document in memory only, checks each path the reader named against
 * the tree, and, when the document's agent asked, queues the reading to it as a board message. A restart forgets every reading.
 */
import { EFFECT_READING_REPORT_SCHEMA } from '../../adapters/reports/ReportSchemas.ts';
import { reportVerdictOf }              from '../../adapters/reports/ReportValidation.ts';
import type { WorkerProfile }           from '../../lib/agent-launch/WorkerProfile.ts';
import { GitProcess }                   from '../../lib/git/GitProcess.ts';
import type { Job }                     from '../../lib/tracker-model/@types/Job.ts';
import type { TicketDocumentKind }      from '../../lib/tracker-model/@types/TicketDocument.ts';
import type { Board }                   from '../../lib/tracker-model/Board.ts';
import type {
  EffectEntry,
  EffectReading,
  EffectReadingRequest,
  EffectReadingSource,
  EffectReference
} from '../../shared/@types/EffectReading.ts';
import { EFFECT_READING_PATH_LIMIT, EFFECT_READING_TIMEOUT_MILLISECONDS } from '../../shared/constants/HephaestusLimits.ts';

const EFFECT_READING_KIND = 'effect-reading';

const FAILED_CAUSE = 'effect-reading-failed';

/** What an effect reader's first message is filled from: the version with its text, and the main line's paths. */
export interface EffectReadingFacts {
  ticketId:      string;
  document:      TicketDocumentKind;
  versionNumber: number;
  versionText:   string;
  paths:         readonly string[];
  /** The tree held more than `EFFECT_READING_PATH_LIMIT` paths, so the list is cut. */
  pathsCut:      boolean;
}

export interface EffectReadingsOptions {
  /** Asks for a pass: a request launches its job in the hold of the next one. */
  wake:                 () => void;
  /** Real time, which only the timeout reads. */
  nowMilliseconds:      () => number;
  timeoutMilliseconds?: number;
}

export interface EffectReadings extends EffectReadingSource {
  /** In the hold: with no reading's job on the board, the oldest waiting request launches one. */
  launchDue:   (board: Board, at: string) => void;
  /** At the launch, outside the hold: the version and the main line's paths, which the paths of the report are then checked against. */
  factsOf:     (board: Board, job: Readonly<Job>, repositoryRoot: string, mainLine: string) => EffectReadingFacts | null;
  /** In the hold that read the reader's `result`: the reading as checked, and the job ended. */
  settle:      (board: Board, jobId: string, report: unknown, at: string) => void;
  /** In the hold: a reader whose session ended with no `result`, past its time, or no request this Hephaestus knows, ends `failed`. */
  failOverdue: (board: Board, endedJobIds: readonly string[], at: string) => string[];
}

interface RunningReading {
  request:   EffectReadingRequest;
  startedAt: number;
  treePaths: ReadonlySet<string> | null;
}

function readingKeyOf(ticketId: string, document: TicketDocumentKind): string {
  return `${ticketId}\u0000${document}`;
}

function isWholeNumberAtLeastOne(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

/** Each file of the revision's tree, as `ls-tree -r -z --full-tree` names it; none when git cannot answer. */
function treePathsOf(repositoryRoot: string, revision: string): string[] {
  const run = GitProcess.run(repositoryRoot, ['ls-tree', '-r', '-z', '--full-tree', revision]);
  if (!GitProcess.succeeded(run)) return [];
  return run.standardOutput.split('\0').filter((entry) => entry !== '').map((entry) => entry.slice(entry.indexOf('\t') + 1));
}

interface ReportedReading {
  references: EffectReference[];
  entries:    EffectEntry[];
}

/**
 * A changed or removed path the tree does not hold is unresolved `no-match`; more than one candidate is `ambiguous`; a path the reader
 * could not place keeps its candidates. An added path is the reader's to name, which no tree can check.
 */
function checkedEntryOf(entry: { reference: number; path: string; change: EffectEntry['change']; detail: string; candidates: string[] }, tree: ReadonlySet<string>): EffectEntry {
  const candidates = [...entry.candidates];
  if (entry.change === 'unresolved' || candidates.length > 1) {
    return {
      reference: entry.reference, path: entry.path, change: 'unresolved', detail: entry.detail, unresolvedReason: candidates.length > 1 ? 'ambiguous' : 'no-match', candidates
    };
  }
  if ((entry.change === 'changes' || entry.change === 'removes') && !tree.has(entry.path)) {
    return {
      reference: entry.reference, path: entry.path, change: 'unresolved', detail: entry.detail, unresolvedReason: 'no-match', candidates
    };
  }
  return {
    reference: entry.reference, path: entry.path, change: entry.change, detail: entry.detail, unresolvedReason: null, candidates
  };
}

/** `null` for a report not of its schema, or one whose numbers are not whole and at least one. */
function reportedReadingOf(report: unknown, tree: ReadonlySet<string>): ReportedReading | null {
  if (reportVerdictOf(EFFECT_READING_REPORT_SCHEMA, report).verdict !== 'valid') return null;
  const { references, entries } = report as {
    references: { reference: number; lines: { from: number; to: number }; quote: string }[];
    entries:    { reference: number; path: string; change: EffectEntry['change']; detail: string; candidates: string[] }[];
  };
  const linesAreWhole = references.every((reference) => isWholeNumberAtLeastOne(reference.reference) && isWholeNumberAtLeastOne(reference.lines.from)
    && reference.lines.to >= reference.lines.from);
  if (!linesAreWhole || !entries.every((entry) => isWholeNumberAtLeastOne(entry.reference))) return null;
  return {
    references: references.map((reference) => ({ reference: reference.reference, lines: { from: reference.lines.from, to: reference.lines.to }, quote: reference.quote })),
    entries:    entries.map((entry) => checkedEntryOf(entry, tree)),
  };
}

/** The reading as data the agent reads, never prose: the version, its references and the checked places. */
function boardMessageTextOf(reading: EffectReading): string {
  return JSON.stringify({
    effectReading: {
      document: reading.document, version: reading.versionNumber, state: reading.state, references: reading.references, entries: reading.entries
    },
  }, null, 2);
}

function createEffectReadings(options: EffectReadingsOptions): EffectReadings {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? EFFECT_READING_TIMEOUT_MILLISECONDS;
  const readingByKey = new Map<string, EffectReading>();
  const waiting: EffectReadingRequest[] = [];
  const runningByJobId = new Map<string, RunningReading>();
  const listeners = new Set<(ticketId: string) => void>();

  function changed(reading: EffectReading): void {
    readingByKey.set(readingKeyOf(reading.ticketId, reading.document), reading);
    for (const listener of listeners) listener(reading.ticketId);
  }

  function readingOf(request: EffectReadingRequest, state: EffectReading['state'], durationMilliseconds: number | null, reported: ReportedReading | null): EffectReading {
    return {
      ticketId:      request.ticketId,
      document:      request.document,
      versionNumber: request.versionNumber,
      state,
      durationMilliseconds,
      references:    reported?.references ?? [],
      entries:       reported?.entries ?? [],
    };
  }

  function request(asked: EffectReadingRequest): void {
    const sameDocument = waiting.findIndex((queued) => queued.ticketId === asked.ticketId && queued.document === asked.document);
    if (sameDocument === -1) waiting.push({ ...asked });
    else waiting.splice(sameDocument, 1, { ...asked });
    changed(readingOf(asked, 'reading', null, null));
    options.wake();
  }

  function launchDue(board: Board, at: string): void {
    if (board.jobs().some((job) => job.kind === EFFECT_READING_KIND)) return;
    const next = waiting.shift();
    if (next === undefined) return;
    const { job } = board.launchJob({
      kind: EFFECT_READING_KIND, role: 'effect-reader', ticketIds: [next.ticketId], parentJobId: null, attempt: next.versionNumber, target: null
    }, at);
    runningByJobId.set(job.id, { request: next, startedAt: options.nowMilliseconds(), treePaths: null });
    // A clock exception, as the plan allows: a reading User waits on must end in real time, so a pass is woken at its timeout.
    setTimeout(options.wake, timeoutMilliseconds).unref();
  }

  function factsOf(board: Board, job: Readonly<Job>, repositoryRoot: string, mainLine: string): EffectReadingFacts | null {
    const running = runningByJobId.get(job.id);
    if (job.kind !== EFFECT_READING_KIND || running === undefined) return null;
    const { ticketId, document, versionNumber } = running.request;
    const versionText = board.ticketDocuments().versionTextOf(ticketId, document, versionNumber);
    if (versionText === null) return null;
    const paths = treePathsOf(repositoryRoot, mainLine);
    running.treePaths = new Set(paths);
    return {
      ticketId, document, versionNumber, versionText, paths: paths.slice(0, EFFECT_READING_PATH_LIMIT), pathsCut: paths.length > EFFECT_READING_PATH_LIMIT
    };
  }

  function end(board: Board, jobId: string, reading: EffectReading | null, at: string): void {
    runningByJobId.delete(jobId);
    if (reading !== null) changed(reading);
    if (board.jobById(jobId) === undefined) return;
    board.endJob(jobId, reading?.state === 'read' ? { outcome: 'closed' } : { outcome: 'failed', cause: FAILED_CAUSE }, at);
  }

  function settle(board: Board, jobId: string, report: unknown, at: string): void {
    const running = runningByJobId.get(jobId);
    if (running === undefined) {
      end(board, jobId, null, at);
      return;
    }
    const reported = reportedReadingOf(report, running.treePaths ?? new Set());
    const duration = options.nowMilliseconds() - running.startedAt;
    const reading  = readingOf(running.request, reported === null ? 'failed' : 'read', duration, reported);
    end(board, jobId, reading, at);
    if (running.request.requestedByAgent) {
      board.ticketDocuments().queueBoardMessage(running.request.ticketId, running.request.document, boardMessageTextOf(reading), at);
    }
  }

  function failOverdue(board: Board, endedJobIds: readonly string[], at: string): string[] {
    const failed: string[] = [];
    for (const job of board.jobs().filter((candidate) => candidate.kind === EFFECT_READING_KIND)) {
      const running = runningByJobId.get(job.id);
      const overdue = running !== undefined && options.nowMilliseconds() - running.startedAt >= timeoutMilliseconds;
      if (running !== undefined && !overdue && !endedJobIds.includes(job.id)) continue;
      end(board, job.id, running === undefined ? null : readingOf(running.request, 'failed', options.nowMilliseconds() - running.startedAt, null), at);
      failed.push(job.id);
    }
    return failed;
  }

  return {
    readingsOf: (ticketId) => [...readingByKey.values()].filter((reading) => reading.ticketId === ticketId),
    request,
    onChanged:  (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    launchDue,
    factsOf,
    settle,
    failOverdue,
  };
}

/**
 * It answers only through its report: no tool, no shell, no web, no question, and the repository root and the tracker's data folder denied
 * explicitly, since the session profile denies neither.
 */
function effectReaderProfileOf(sessionProfile: WorkerProfile, repositoryRoot: string, trackerDirectory: string): WorkerProfile {
  return {
    ...sessionProfile,
    deniedReadableRoots: [...new Set([...sessionProfile.deniedReadableRoots, repositoryRoot, trackerDirectory])],
    shellNetworkDomains: [],
    webNetworkDomains:   'none',
    askUser:             false,
    skills:              false,
    networkDomainGuard:  null,
    availableTools:      'none',
  };
}

export const EffectReadings = Object.freeze({ createEffectReadings, effectReaderProfileOf, treePathsOf });
