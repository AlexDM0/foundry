/**
 * Hephaestus's `BoardState` document, `GET /api/state` and the `board` event: the `status --json` document plus the page's islands,
 * every job with its live facts, the notices, the merge queue, Hephaestus and usage, all from one reading Board. The open summary,
 * `summaryVersion: 3`, is derived from it.
 */
import type { BoardSummaryDocument } from 'forge-contracts/BoardSummaryDocument';

import type {
  EndedJob,
  JobLiveFactsWithSilence,
  JobWithLiveFacts,
  LostLineFacts,
  MergeQueueFacts,
  MergeTargetFacts,
  HephaestusFacts,
  HephaestusRuntimeState,
  PictureLimits,
  UsageFacts,
  WaitingForMergeEntry
} from '../../adapters/@types/BoardStateParts.ts';
import type { FullStatusDocument }                                                            from '../../adapters/@types/StatusDocument.ts';
import type { PipelineReading }                                                               from '../../adapters/pipeline/PipelineFile.ts';
import { GitProcess }                                                                         from '../../lib/git/GitProcess.ts';
import type { Decision }                                                                      from '../../lib/tracker-model/@types/Decision.ts';
import type { Draft }                                                                         from '../../lib/tracker-model/@types/Draft.ts';
import type { Epic }                                                                          from '../../lib/tracker-model/@types/Epic.ts';
import type { GateProfilesReading }                                                           from '../../lib/tracker-model/@types/GateProfile.ts';
import type { Incident }                                                                      from '../../lib/tracker-model/@types/Incident.ts';
import type { Job }                                                                           from '../../lib/tracker-model/@types/Job.ts';
import type { LaunchSlots }                                                                   from '../../lib/tracker-model/@types/LaunchSlots.ts';
import type { LogRecord }                                                                     from '../../lib/tracker-model/@types/LogRecord.ts';
import type { PipelineSetupReading }                                                          from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Ticket }                                                                        from '../../lib/tracker-model/@types/Ticket.ts';
import type { TicketForecast }                                                                from '../../lib/tracker-model/@types/TicketForecast.ts';
import type { TrackerProgress }                                                               from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { BranchTreeOf, MergeTargetOf }                                                   from '../../lib/tracker-model/AirlockClaims.ts';
import type { Board }                                                                         from '../../lib/tracker-model/Board.ts';
import { MergeQueueUtil, type MergeForecast, type PairwiseConflict }                          from '../../lib/tracker-model/utils/MergeQueueUtil.ts';
import { SERVED_CONTRACT_VERSIONS }                                                           from '../../shared/constants/HephaestusApiContracts.ts';
import { ACCEPTED_PICTURE_MEDIA_TYPES, PICTURE_SIZE_LIMIT_BYTES, PICTURES_PER_MESSAGE_LIMIT } from '../../shared/constants/HephaestusLimits.ts';
import { boardFactsOf }                                                                       from '../render/BoardFacts.ts';
import { assemblePagePayload, type AssembledPagePayload }                                     from '../render/PagePayloadAssembly.ts';
import { pipelineFactsOf, type MainLineTexts, type PipelineFacts }                            from '../render/PipelineFactsAssembly.ts';
import { InstructionFiles }                                                                   from './InstructionFiles.ts';
import { LaunchSettings }                                                                     from './LaunchSettings.ts';
import type { MainLineReads }                                                                 from './MainLineReads.ts';

/** git's predictions for a target's waiting candidates, which Hephaestus reads from the repository. */
export interface MergeForecasts {
  againstTarget:     Readonly<Record<string, { forecast: MergeForecast; conflictedFiles: string[] | null }>>;
  pairwiseConflicts: PairwiseConflict[];
}

export interface MergeForecasting {
  targetOf:     MergeTargetOf;
  /** A queued ticket is shown as a candidate only while its green is current on this tree, as the Airlocks admit it. */
  branchTreeOf: BranchTreeOf;
  forecastsOf:  (target: string, ticketIds: readonly string[]) => MergeForecasts;
}

export interface BoardStateReading {
  /** The `status --json --full` document, built by the command surface from the same Board. */
  statusDocument:     FullStatusDocument;
  board:              Board;
  progress:           TrackerProgress;
  tickets:            readonly Ticket[];
  epics:              readonly Epic[];
  drafts:             readonly Draft[];
  logRecords:         readonly LogRecord[];
  generatedAt:        Date;
  liveFactsOf:        (job: Readonly<Job>) => JobLiveFactsWithSilence;
  notices:            readonly unknown[];
  hephaestus:         HephaestusFacts;
  usage:              UsageFacts;
  /** `null` leaves the merge queue's targets empty, as a reading without a repository to predict in does. */
  mergeForecasting:   MergeForecasting | null;
  /** The agent adapter's `capabilities.pictures`: without it no message carries a picture. */
  agentTakesPictures: boolean;
  pipelineSources:    PipelineSources;
}

/** The stored pipeline files as read, and what the main line holds, for the pipeline facts. */
export interface PipelineSources {
  pipelineReading:      PipelineReading;
  /** The stored `pipeline.json` text; null when it could not be read. */
  pipelineFileText:     string | null;
  pipelineSetupReading: PipelineSetupReading;
  gateProfilesReading:  GateProfilesReading;
  mainLine:             string | null;
  mainLineTexts:        MainLineTexts;
}

export interface BoardState extends Omit<FullStatusDocument, 'jobs' | 'decisions' | 'incidents'>, PipelineFacts {
  page:            AssembledPagePayload;
  jobs:            JobWithLiveFacts[];
  decisions:       Decision[];
  incidents:       Incident[];
  notices:         unknown[];
  mergeQueue:      MergeQueueFacts;
  hephaestus:      HephaestusFacts;
  usage:           UsageFacts;
  /** What an open decision or incident leaves behind once it is settled, and the sessions a client shows after they end: see `questionHistoryOf`. */
  questionHistory: LogRecord[];
  /** The newest jobs that left the board, oldest first, so a job launched and ended between two states still reaches the stream as `ended`. */
  endedJobs:       EndedJob[];
  /** Each open ticket's steps to its landing and the tickets waiting on it; never in `status --json`. */
  ticketForecasts: TicketForecast[];
  /** The jobs `concurrency.agentsInFlight` counts, and the in-progress tickets no job works on; never in `status --json`. */
  launchSlots:     LaunchSlots;
  /** `null` when the agent adapter cannot send a session pictures. */
  pictureLimits:   PictureLimits | null;
}

/** The package's `BoardSummaryDocument`, with every key forge sends. */
export interface BoardSummary extends BoardSummaryDocument {
  summaryVersion:      typeof SERVED_CONTRACT_VERSIONS.summary;
  project:             string;
  hephaestus:          { state: HephaestusRuntimeState; paused: boolean; url: string | null };
  ticketCountByStatus: unknown;
  readyTicketIds:      string[];
  jobs:                { id: string; kind: string; ticketIds: string[]; state: string; role: string | null; tokens: number }[];
  openDecisions:       number;
  openIncidents:       number;
  /** The usage marker alone: the windows are not part of the version 1 contract. */
  usage:               Pick<UsageFacts, 'resetsAt' | 'window'>;
}

function mergeTargetOf(board: Board, target: string, forecasting: MergeForecasting): MergeTargetFacts {
  const candidates = board.mergeCandidatesOf(target, forecasting.targetOf, forecasting.branchTreeOf);
  const waiting    = board.ticketsWaitingForMergeOf(target, forecasting.targetOf, forecasting.branchTreeOf).sort((a, b) => a.readiness - b.readiness);
  // One prediction run for both lists, so the forecast cache keeps one tip set per target; the pairs stay the candidates' own.
  const forecastsOfBoth  = forecasting.forecastsOf(target, [...candidates, ...waiting].map((candidate) => candidate.ticketId));
  const candidateIds     = new Set(candidates.map((candidate) => candidate.ticketId));
  const forecasts: MergeForecasts = {
    againstTarget:     forecastsOfBoth.againstTarget,
    pairwiseConflicts: forecastsOfBoth.pairwiseConflicts.filter(([first, second]) => candidateIds.has(first) && candidateIds.has(second)),
  };
  const predictionOf = (ticketId: string) => (Object.hasOwn(forecasts.againstTarget, ticketId) ? forecasts.againstTarget[ticketId] : undefined);
  const waitingForMerge = waiting.map((candidate): WaitingForMergeEntry => ({
    ticketId:        candidate.ticketId,
    priority:        candidate.priority,
    againstTarget:   predictionOf(candidate.ticketId)?.forecast ?? 'prediction-failed',
    conflictedFiles: predictionOf(candidate.ticketId)?.conflictedFiles ?? null,
  }));
  const queueCandidates = candidates.map((candidate) => ({
    ticketId:          candidate.ticketId,
    priority:          candidate.priority,
    againstTarget:     predictionOf(candidate.ticketId)?.forecast ?? 'prediction-failed',
    queuedLogPosition: candidate.readiness,
  }));
  const holder = board.jobs().find((job) => job.airlock?.target === target);
  const ticketTargetIs = (ticketId: string): boolean => {
    const ticket = board.ticketByReference(ticketId);
    return ticket !== undefined && forecasting.targetOf(ticket.frontmatter) === target;
  };
  return {
    target,
    holder: holder?.airlock === undefined ? null : { jobId: holder.id, ticketIds: [...holder.ticketIds], phase: holder.airlock.phase },
    order:  (board.mergeApprovalIsOn() ? MergeQueueUtil.pressOrderOf(queueCandidates) : MergeQueueUtil.orderOf(queueCandidates, forecasts.pairwiseConflicts)).map((candidate) => ({
      ticketId:        candidate.ticketId,
      priority:        candidate.priority,
      againstTarget:   candidate.againstTarget,
      conflictedFiles: predictionOf(candidate.ticketId)?.conflictedFiles ?? null,
      conflictsCaused: MergeQueueUtil.conflictsCausedBy(candidate, queueCandidates, forecasts.pairwiseConflicts),
    })),
    waitingForMerge,
    pairwiseConflicts:      [...forecasts.pairwiseConflicts],
    targetMovedDecisionIds: board.decisions()
      .filter((decision) => decision.kind === 'target-moved' && decision.ticketIds.some(ticketTargetIs))
      .map((decision) => decision.id),
  };
}

function mergeQueueOf(board: Board, forecasting: MergeForecasting | null): MergeQueueFacts {
  const queuedTicketIds = board.tickets().map((ticket) => ticket.frontmatter.id).filter((ticketId) => board.ticketIsMergeQueued(ticketId));
  const slots = board.jobs().flatMap((job) => (job.airlock === undefined ? [] : [{ jobId: job.id, target: job.airlock.target, phase: job.airlock.phase }]));
  if (forecasting === null) return { queuedTicketIds, slots, targets: [] };
  const queuedTargets = queuedTicketIds.flatMap((ticketId) => {
    const ticket = board.ticketByReference(ticketId);
    return ticket === undefined ? [] : [forecasting.targetOf(ticket.frontmatter)];
  });
  const targets = [...new Set([...slots.map((slot) => slot.target), ...queuedTargets])].sort();
  return { queuedTicketIds, slots, targets: targets.map((target) => mergeTargetOf(board, target, forecasting)) };
}

const SESSION_JOB_KINDS: ReadonlySet<string> = new Set(['assistant', 'product-owner', 'pipeline-agent']);

/**
 * The log records a client's question, Assistant and intake views read: every decision and incident record, and every record of an
 * Assistant, product-owner or pipeline agent job, since an answered decision, a handled incident and a closed intake leave the board.
 */
function questionHistoryOf(logRecords: readonly LogRecord[]): LogRecord[] {
  const sessionJobIds = new Set(logRecords.flatMap((record) => (record.kind === 'job-launched' && SESSION_JOB_KINDS.has(record.fields.kind) ? [record.jobId] : [])));
  return logRecords.filter((record) => {
    if ('decisionId' in record || 'incidentId' in record) return true;
    return 'jobId' in record && sessionJobIds.has(record.jobId);
  });
}

const ENDED_JOBS_SHOWN = 32;

function endedJobsOf(logRecords: readonly LogRecord[]): EndedJob[] {
  const launchById = new Map(logRecords.flatMap((record) => (record.kind === 'job-launched' ? [[record.jobId, record.fields] as const] : [])));
  // A reopened job ends again: only its newest ending stays, in that ending's place.
  const newestEndingById = new Map<string, EndedJob>();
  for (const record of logRecords) {
    const launch = record.kind === 'job-ended' ? launchById.get(record.jobId) : undefined;
    if (record.kind !== 'job-ended' || launch === undefined) continue;
    newestEndingById.delete(record.jobId);
    newestEndingById.set(record.jobId, {
      id:        record.jobId,
      kind:      launch.kind,
      role:      launch.role,
      ticketIds: [...launch.ticketIds],
      target:    launch.target,
      attempt:   launch.attempt,
      state:     'ended',
      outcome:   record.fields.outcome,
      cause:     record.fields.cause ?? null,
      endedAt:   record.at,
    });
  }
  return [...newestEndingById.values()].slice(-ENDED_JOBS_SHOWN);
}

/** A stamp only shown: no decision reads it, so it stays outside "a clock decides nothing". */
function launchedAtByJobIdOf(logRecords: readonly LogRecord[]): ReadonlyMap<string, string> {
  return new Map(logRecords.flatMap((record) => (record.kind === 'job-launched' ? [[record.jobId, record.at] as const] : [])));
}

/** The job's newest lost line while it waits for User's resume, as the presence document reads it; `null` while none waits. */
function lostLineOf(board: Board, job: Readonly<Job>, logRecords: readonly LogRecord[]): LostLineFacts | null {
  if (!board.lostLineAwaitsResume(job)) return null;
  let lostLine: LostLineFacts | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-line-lost' && record.jobId === job.id) lostLine = { line: record.fields.line, cause: record.fields.cause };
  }
  return lostLine;
}

/** No main line read: no text, no constitution and no commit counted. */
const NO_MAIN_LINE_TEXTS: MainLineTexts = Object.freeze({
  textOf:               () => null,
  mainConstitution:     () => ({ verdict: 'absent' as const }),
  mainMovedByCommitsOf: () => 0,
});

/**
 * The main line's texts for one state read: the tip is resolved once, and every text, main's constitution and the commit count go through
 * the reads kept across calls, so a read whose main tip has not moved runs no `git show`.
 */
function mainLineTextsOf(reads: MainLineReads, rootDirectory: string, mainLine: string | null): MainLineTexts {
  const mainTip = mainLine === null ? null : GitProcess.resolvedCommitOf(rootDirectory, mainLine);
  if (mainTip === null) return NO_MAIN_LINE_TEXTS;
  return {
    textOf:               (path) => reads.textAt(mainTip, path),
    mainConstitution:     (constitutionPath) => reads.mainConstitutionAt(mainTip, constitutionPath),
    mainMovedByCommitsOf: (snapshotCommit) => reads.mainMovedByCommitsOf(snapshotCommit, mainTip),
  };
}

function boardStateOf(reading: BoardStateReading): BoardState {
  const { board } = reading;
  const launchedAtByJobId = launchedAtByJobIdOf(reading.logRecords);
  const page = assemblePagePayload({
    progress:          reading.progress,
    logRecords:        reading.logRecords,
    tickets:           reading.tickets,
    epics:             reading.epics,
    pageScriptFailure: null,
    generatedAt:       reading.generatedAt,
    concurrency:       board.concurrency(),
    boardFacts:        boardFactsOf(board),
    draftRequests:     reading.drafts.map((draft) => ({ id: draft.id, request: draft.request })),
    documentRecords:   board,
  });
  return {
    ...reading.statusDocument,
    ...pipelineFactsOf({
      ...reading.pipelineSources,
      board,
      logRecords:        reading.logRecords,
      instructionPathOf: InstructionFiles.instructionPathOf,
      defaultSettingsOf: LaunchSettings.defaultAgentPairOf,
      generatedAt:       reading.generatedAt,
    }),
    page,
    jobs: board.jobs().map((job) => ({
      ...job, launchedAt: launchedAtByJobId.get(job.id) ?? null, live: reading.liveFactsOf(job), lostLine: lostLineOf(board, job, reading.logRecords)
    })),
    decisions:       [...board.decisions()],
    incidents:       [...board.incidents()],
    notices:         [...reading.notices],
    mergeQueue:      mergeQueueOf(board, reading.mergeForecasting),
    hephaestus:      reading.hephaestus,
    usage:           reading.usage,
    questionHistory: questionHistoryOf(reading.logRecords),
    endedJobs:       endedJobsOf(reading.logRecords),
    ticketForecasts: board.ticketForecastsOf(reading.mergeForecasting?.targetOf ?? null),
    launchSlots:     board.launchSlots(),
    pictureLimits:   reading.agentTakesPictures
      ? { perMessage: PICTURES_PER_MESSAGE_LIMIT, sizeLimitBytes: PICTURE_SIZE_LIMIT_BYTES, mediaTypes: [...ACCEPTED_PICTURE_MEDIA_TYPES] }
      : null,
  };
}

function summaryOf(state: BoardState, project: string, readyTicketIds: readonly string[]): BoardSummary {
  return {
    summaryVersion:      SERVED_CONTRACT_VERSIONS.summary,
    project,
    hephaestus:          { state: state.hephaestus.state, paused: state.hephaestus.paused, url: state.hephaestus.url },
    ticketCountByStatus: state.ticketCountByStatus,
    readyTicketIds:      [...readyTicketIds],
    jobs:                state.jobs.map((job) => ({
      id: job.id, kind: job.kind, ticketIds: [...job.ticketIds], state: job.state, role: job.role, tokens: job.live.tokens
    })),
    openDecisions: state.decisions.length,
    openIncidents: state.incidents.length,
    usage:         { resetsAt: state.usage.resetsAt, window: state.usage.window },
  };
}

export const BoardStateAssembly = Object.freeze({
  boardStateOf, summaryOf, mergeQueueOf, questionHistoryOf, endedJobsOf, mainLineTextsOf, NO_MAIN_LINE_TEXTS
});
