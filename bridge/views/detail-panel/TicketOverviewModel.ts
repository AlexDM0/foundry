/**
 * The ticket form's Overview, as a model: the state card (what works on the ticket now, or why nothing does), the one likely action, Next
 * (the Overseer's forecast of the steps to the landing), the other moves with their effects, and the facts. The live job is joined here by
 * its `ticketIds`; nothing here decides a step: the forecast and the controls are the Board's and the Overseer's.
 */
import type { DisplayState }         from '../../../src/lib/tracker-model/@types/Task.ts';
import { FIRST_REPEAT_REVIEW_ROUND } from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import type {
  DetailBoardState,
  DetailJobDocument,
  DetailTaskDocument,
  DetailTicketDocument,
  DetailTicketForecastDocument
} from '../../@types/DetailBoardState.ts';
import { DisplayStateWordingUtil }                  from '../../utils/DisplayStateWordingUtil.ts';
import { JobLiveFactsUtil }                         from '../../utils/JobLiveFactsUtil.ts';
import { TimeUtil }                                 from '../../utils/TimeUtil.ts';
import type { DetailControlsModel, MergeWaitModel } from './DetailControlsModel.ts';
import {
  CLOSING_EVENT_WORD,
  DetailFactsModel,
  type DetailFactModel,
  type DetailFormat,
  type DetailLinkModel,
  type StampModel
} from './DetailFactsModel.ts';

/** The jobs that work on a ticket; a session (assistant, product owner) may name a ticket and is never joined. */
const TICKET_JOB_KINDS: readonly string[] = ['build', 'review', 'merge-agent'];

const HEADING_FOR_JOB_STATE: Readonly<Record<string, string>> = {
  'in-customs': 'In Customs',
  'gating':     'Gating',
  'merging':    'Landing',
  'landing':    'Landing',
};

const HEADING_FOR_JOB_KIND: Readonly<Record<string, string>> = {
  'build':       'Building',
  'review':      'Reviewing',
  'merge-agent': 'Resolving',
};

const REVIEWER_ROLE = 'reviewer';

/** `ticket park` with no incident holds the ticket under this kind (`docs/cli.md`). */
const USER_PARK_HOLD = 'parked:user';

const QUEUED_NOTE = 'In the queue.';

export type TicketMove = 'ready' | 'merge-accept' | 'unhold' | 'merge-update' | 'hold' | 'park' | 'network';

export type TextPartModel =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'figure'; readonly text: string }
  | { readonly kind: 'emphasis'; readonly text: string }
  | { readonly kind: 'link'; readonly link: DetailLinkModel };

export interface NowJobModel {
  readonly jobId:        string;
  /** `builder`, `reviewer`, or the job's kind where it has no role. */
  readonly roleText:     string;
  readonly attempt:      number;
  readonly since:        StampModel | null;
  /** `1m`, the time since `since`; only shown, and left off when the stamp is later than now. */
  readonly elapsedText:  string | null;
  readonly callsText:    string;
  readonly lastToolText: string;
}

export interface NowCardModel {
  readonly stateToken: DisplayState;
  /** What the job does (`Building`, `In Customs`), or the ticket's state label with no job. */
  readonly heading:    string;
  readonly job:        NowJobModel | null;
  /** With no job: why nothing works on the ticket, `null` when the heading says it all. */
  readonly note:       string | null;
}

/** A move the panel offers; `opens` a field to fill before the move is sent, `sendable` false where the Overseer would refuse it. */
export interface MoveModel {
  readonly move:     TicketMove;
  readonly label:    string;
  readonly effect:   readonly TextPartModel[];
  readonly opens:    'reason' | 'domains' | null;
  readonly sendable: boolean;
  /** Set network…'s field starts from the domains stored now. */
  readonly domains?: readonly string[];
}

export type LeadActionModel =
  | { readonly kind: 'watch-job'; readonly jobId: string; readonly effect: readonly TextPartModel[] }
  | { readonly kind: 'move'; readonly move: MoveModel };

export interface NextStepModel {
  readonly key:     string;
  readonly current: boolean;
  readonly parts:   readonly TextPartModel[];
}

export interface TicketOverviewModel {
  readonly now:             NowCardModel;
  readonly lead:            LeadActionModel | null;
  /** The conflicted files under the lead while the ticket waits for merge; empty otherwise. */
  readonly conflictedFiles: readonly string[];
  /** `null` when the board carries no forecast for the ticket: an older Overseer, a closed ticket or a draft. */
  readonly nextSteps:       readonly NextStepModel[] | null;
  readonly otherMoves:      readonly MoveModel[];
  readonly facts:           readonly DetailFactModel[];
}

/** What the Overview reads of the ticket form's model: the ticket, its board facts and rows, and the controls the panel offers. */
export interface TicketOverviewReading {
  readonly state:        DetailBoardState;
  readonly ticket:       DetailTicketDocument;
  readonly displayState: DisplayState;
  readonly waitingOn:    readonly string[];
  readonly ownRow:       DetailTaskDocument | null;
  readonly reviewRows:   readonly DetailTaskDocument[];
  readonly controls:     DetailControlsModel;
  readonly format:       DetailFormat;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLastToolCall(value: unknown): boolean {
  return value === null || (isRecord(value) && typeof value['toolName'] === 'string' && typeof value['running'] === 'boolean');
}

function isLiveFacts(value: unknown): boolean {
  return isRecord(value)
    && typeof value['calls'] === 'number'
    && (value['callBudget'] === null || typeof value['callBudget'] === 'number')
    && isLastToolCall(value['lastToolCall']);
}

/** A job record holding every field the Overview reads; a partial one, from an older Overseer or a spec, is passed over. */
function isDetailJob(value: unknown): value is DetailJobDocument {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && typeof value['kind'] === 'string'
    && (value['role'] === null || typeof value['role'] === 'string')
    && Array.isArray(value['ticketIds'])
    && typeof value['state'] === 'string'
    && typeof value['attempt'] === 'number'
    && isLiveFacts(value['live']);
}

/** The build, review or merge-agent job working on the ticket: the Playbook keeps at most one on a ticket. */
function liveJobOf(jobs: readonly unknown[] | undefined, ticketId: string): DetailJobDocument | null {
  return (jobs ?? []).filter(isDetailJob).find((job) => TICKET_JOB_KINDS.includes(job.kind) && job.ticketIds.includes(ticketId)) ?? null;
}

function textOf(text: string): TextPartModel {
  return { kind: 'text', text };
}

function emphasisOf(text: string): TextPartModel {
  return { kind: 'emphasis', text };
}

function figureOf(text: string): TextPartModel {
  return { kind: 'figure', text };
}

/** `#001`, `#001 and #011`, `#001, #002 and #011`. */
function listTextOf(items: readonly string[]): string {
  const last = items.at(-1);
  if (last === undefined) return '';
  return items.length === 1 ? last : `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** `#001 and #011` with each id a figure and the joining words plain text. */
function figureListPartsOf(items: readonly string[]): TextPartModel[] {
  return items.flatMap((item, index): TextPartModel[] => {
    let joint: TextPartModel[] = [];
    if (index === items.length - 1 && index > 0) joint = [textOf(' and ')];
    else if (index > 0) joint = [textOf(', ')];
    return [...joint, figureOf(item)];
  });
}

function idTextOf(ticketId: string): string {
  return `#${ticketId}`;
}

function headingOf(job: DetailJobDocument): string {
  if (Object.hasOwn(HEADING_FOR_JOB_STATE, job.state)) return HEADING_FOR_JOB_STATE[job.state] ?? job.state;
  return Object.hasOwn(HEADING_FOR_JOB_KIND, job.kind) ? HEADING_FOR_JOB_KIND[job.kind] ?? job.kind : job.kind;
}

/** A review counts from its newest review row's start; a build from its own row's newest `in-progress` phase, else the ticket's start. */
function sinceStampOf(job: DetailJobDocument, reading: TicketOverviewReading): string | null {
  if (job.role === REVIEWER_ROLE) return reading.reviewRows.at(-1)?.start ?? null;
  const resumedAt = (reading.ownRow?.history ?? []).findLast((phase) => phase.status === 'in-progress')?.at;
  if (resumedAt !== undefined && resumedAt !== '') return resumedAt;
  return reading.ticket.started;
}

function nowJobOf(job: DetailJobDocument, reading: TicketOverviewReading): NowJobModel {
  const { format } = reading;
  const since = sinceStampOf(job, reading);
  const sinceEpochMilliseconds = TimeUtil.epochMillisecondsOf(since);
  // Measuring against now is a stated clock exception that decides only the text; a backfilled stamp later than now shows none.
  const elapsedText = sinceEpochMilliseconds === null ? null : TimeUtil.formatDuration(format.nowEpochMilliseconds - sinceEpochMilliseconds, format.limits);
  return {
    jobId:        job.id,
    roleText:     job.role ?? job.kind,
    attempt:      job.attempt,
    since:        since === null || since === '' ? null : DetailFactsModel.stampOf(since, format),
    elapsedText,
    callsText:    JobLiveFactsUtil.callsAgainstBudgetOf(job),
    lastToolText: JobLiveFactsUtil.lastToolCallTextOf(job.live.lastToolCall),
  };
}

function closedNoteOf(ticket: DetailTicketDocument, format: DetailFormat): string | null {
  if (ticket.status === 'delivered' && ticket.delivered !== null) return `Done at ${DetailFactsModel.stampOf(ticket.delivered, format).shortText}.`;
  if (ticket.status !== 'abandoned') return null;
  if (ticket.reason !== undefined && ticket.reason !== '') return `Abandoned: ${ticket.reason}`;
  return ticket.abandonedAt === null ? null : `Abandoned at ${DetailFactsModel.stampOf(ticket.abandonedAt, format).shortText}.`;
}

/** Why nothing works on the ticket: held, waiting on its dependencies, waiting for User's accept, queued, or closed. */
function noteOf(reading: TicketOverviewReading): string | null {
  const { ticket, waitingOn, controls } = reading;
  if (ticket.hold !== undefined) return ticket.hold === '' ? 'Held, with no reason given.' : `Held: ${ticket.hold}`;
  if (waitingOn.length > 0) return `Waits on ${listTextOf(waitingOn.map(idTextOf))}.`;
  if (controls.mergeWait !== undefined) return `Waiting for merge: ${controls.mergeWait.predictionText}.`;
  if (ticket.status === 'pending') return QUEUED_NOTE;
  return closedNoteOf(ticket, reading.format);
}

function nowCardOf(liveJob: DetailJobDocument | null, reading: TicketOverviewReading): NowCardModel {
  const { displayState, ownRow } = reading;
  if (liveJob !== null) return {
    stateToken: displayState, heading: headingOf(liveJob), job: nowJobOf(liveJob, reading), note: null
  };
  return {
    stateToken: displayState,
    heading:    DisplayStateWordingUtil.stateLabelOf(displayState, ownRow?.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND),
    job:        null,
    note:       noteOf(reading),
  };
}

function acceptMoveOf(ticketId: string, mergeWait: MergeWaitModel): MoveModel {
  return {
    move:   'merge-accept',
    label:  'Accept',
    effect: [
      textOf('Accepts '),
      emphasisOf(idTextOf(ticketId)),
      textOf(' into '),
      figureOf(mergeWait.target),
      textOf(mergeWait.accepts ? ', so its Airlock may land it.' : ', so its Airlock may land it. Only a clean prediction can be accepted.'),
    ],
    opens:    null,
    sendable: mergeWait.accepts,
  };
}

function parkMoveOf(ticketId: string, liveJob: DetailJobDocument | null): MoveModel {
  return {
    move:   'park',
    label:  'Park…',
    effect: [
      textOf('Holds '),
      emphasisOf(idTextOf(ticketId)),
      textOf(' as '),
      figureOf(USER_PARK_HOLD),
      textOf(' and puts the reason to User as a parked decision.'),
      ...(liveJob === null ? [] : [textOf(` ${liveJob.id} runs on to its end; no builder or reviewer launches after it.`)]),
    ],
    opens:    'reason',
    sendable: true,
  };
}

/** Every move the controls offer, in the order the panel lists them; the lead is taken out of them by `overviewOf`. */
function movesOf(controls: DetailControlsModel, ticketId: string, liveJob: DetailJobDocument | null): MoveModel[] {
  const id = idTextOf(ticketId);
  const moves: MoveModel[] = [];
  if (controls.readies) {
    moves.push({
      move:     'ready',
      label:    'Ready',
      effect:   [textOf('Makes '), emphasisOf(id), textOf(' pending with its row, so a builder can take it.')],
      opens:    null,
      sendable: true,
    });
  }
  if (controls.mergeWait !== undefined) moves.push(acceptMoveOf(ticketId, controls.mergeWait));
  if (controls.holdMove === 'unhold') {
    moves.push({
      move:     'unhold',
      label:    'Unhold',
      effect:   [textOf('Lifts the hold on '), emphasisOf(id), textOf('; the step it held starts at the Overseer\'s next Pass.')],
      opens:    null,
      sendable: true,
    });
  }
  if (controls.mergeWait !== undefined) {
    moves.push({
      move:     'merge-update',
      label:    'Update branch',
      effect:   [textOf('Merges '), figureOf(controls.mergeWait.target), textOf(' into the branch of '), emphasisOf(id), textOf('; the Overseer gates it again on its next Pass.')],
      opens:    null,
      sendable: true,
    });
  }
  if (controls.holdMove === 'hold') {
    moves.push({
      move:     'hold',
      label:    'Hold…',
      effect:   [textOf('Holds '), emphasisOf(id), textOf(': the Overseer launches no builder or reviewer for it until it is unheld.')],
      opens:    'reason',
      sendable: true,
    });
  }
  if (controls.parks) moves.push(parkMoveOf(ticketId, liveJob));
  if (controls.setsNetwork) {
    moves.push({
      move:     'network',
      label:    'Set network…',
      effect:   [textOf('Sets the public domains the agents of '), emphasisOf(id), textOf(' may reach.')],
      opens:    'domains',
      sendable: true,
      domains:  controls.network,
    });
  }
  return moves;
}

/** The one likely action: watch the job at work; else Accept a ticket waiting for merge, Ready a draft, or Unhold a held ticket. */
function leadOf(liveJob: DetailJobDocument | null, moves: readonly MoveModel[]): LeadActionModel | null {
  if (liveJob !== null) return { kind: 'watch-job', jobId: liveJob.id, effect: [textOf(`Opens ${liveJob.id}'s transcript on Agents.`)] };
  const leadMove = moves.find((move) => move.move === 'merge-accept' || move.move === 'ready' || move.move === 'unhold');
  return leadMove === undefined ? null : { kind: 'move', move: leadMove };
}

function ticketLinkOf(ticketId: string): TextPartModel {
  return { kind: 'link', link: { text: idTextOf(ticketId), item: { form: 'ticket', ticketId } } };
}

/** `; #005 Delivery ETA can start, and #012 still waits on #001 and #011`, each ticket a link that opens its ticket form. */
function dependentPartsOf(forecast: DetailTicketForecastDocument, tickets: readonly DetailTicketDocument[]): TextPartModel[] {
  return forecast.dependents.flatMap((dependent, index): TextPartModel[] => {
    let joint = ', ';
    if (index === 0) joint = '; ';
    else if (index === forecast.dependents.length - 1) joint = ', and ';
    if (dependent.stillWaitingOnTicketIds.length > 0) {
      return [textOf(joint), ticketLinkOf(dependent.ticketId), textOf(' still waits on '), ...figureListPartsOf(dependent.stillWaitingOnTicketIds.map(idTextOf))];
    }
    const title = tickets.find((ticket) => ticket.id === dependent.ticketId)?.title;
    return [textOf(joint), ticketLinkOf(dependent.ticketId), textOf(title === undefined ? ' can start' : ` ${title} can start`)];
  });
}

function customsPartsOf(gateCount: number, jobId: string | null): TextPartModel[] {
  const handoff = jobId === null ? 'the handoff' : `${jobId}'s handoff`;
  if (gateCount === 0) return [textOf(`Customs checks ${handoff}.`)];
  return [textOf(`Customs checks ${handoff} and runs ${gateCount === 1 ? 'the gate' : 'the gates'}.`)];
}

function landingPartsOf(verb: string, target: string | null): TextPartModel[] {
  return target === null ? [textOf('It lands')] : [textOf(`It ${verb} `), figureOf(target)];
}

/** The forecast's step in words; a customs step with no job of its own names the build job before it, whose handoff it checks. */
function stepPartsOf(step: DetailTicketForecastDocument['steps'][number], ticketId: string, buildJobId: string | null): TextPartModel[] {
  const id = figureOf(idTextOf(ticketId));
  switch (step.kind) {
    case 'build':
      if (step.jobId === null) return [textOf('A builder takes '), id, textOf(' when a launch slot frees, attempt '), figureOf(String(step.attempt)), textOf('.')];
      return [textOf(`${step.jobId} builds `), id, textOf(', attempt '), figureOf(String(step.attempt)), textOf(', and reports its handoff.')];
    case 'customs-and-gates':
      return customsPartsOf(step.gateNames.length, step.jobId ?? buildJobId);
    case 'review':
      if (step.jobId === null) return [textOf('A reviewer takes '), id, textOf(', review round '), figureOf(String(step.round)), textOf('.')];
      return [textOf(`${step.jobId} reviews `), id, textOf(', review round '), figureOf(String(step.round)), textOf('.')];
    case 'merge-approval':
      return step.target === null ? [textOf('It waits for User\'s accept.')] : [textOf('It waits for User\'s accept into '), figureOf(step.target), textOf('.')];
    case 'land':
      return landingPartsOf('lands on', step.target);
    case 'integrate':
      return landingPartsOf('integrates into', step.target);
    default:
      return [];
  }
}

/** The forecast's steps worded, the landing followed by the tickets it lets start; `null` when the board holds no forecast for the ticket. */
function nextStepsOf(forecasts: readonly DetailTicketForecastDocument[] | undefined, tickets: readonly DetailTicketDocument[], ticketId: string): NextStepModel[] | null {
  const forecast = (forecasts ?? []).find((candidate) => candidate.ticketId === ticketId);
  if (forecast === undefined) return null;
  const buildJobId = forecast.steps.find((step) => step.kind === 'build')?.jobId ?? null;
  return forecast.steps.map((step, index) => {
    const isLanding = step.kind === 'land' || step.kind === 'integrate';
    return {
      key:     `${String(index)}:${step.kind}`,
      current: index === forecast.currentStepIndex,
      parts:   isLanding ? [...stepPartsOf(step, ticketId, buildJobId), ...dependentPartsOf(forecast, tickets), textOf('.')] : stepPartsOf(step, ticketId, buildJobId),
    };
  });
}

/** A build job's attempt under Started; a review job's attempt is its round, which Next names. */
function startedSecondaryOf(liveJob: DetailJobDocument | null): Partial<{ secondaryText: string }> {
  return liveJob === null || liveJob.role === REVIEWER_ROLE ? {} : { secondaryText: `attempt ${String(liveJob.attempt)}` };
}

function withSecondary(facts: readonly DetailFactModel[], secondary: Partial<{ secondaryText: string }>): DetailFactModel[] {
  return facts.map((fact) => ({ ...fact, ...secondary }));
}

/** The ticket's facts in their fixed order (epics, integration, stamps, pause, closing, reason, held, waiting on, branch, task), network last. */
function factsOf(reading: TicketOverviewReading, liveJob: DetailJobDocument | null): DetailFactModel[] {
  const {
    state, ticket, displayState, waitingOn, ownRow, format
  } = reading;
  const { tickets, payload } = state.page;
  return [
    ...DetailFactsModel.epicFactsOf(ticket, payload.boardFacts.epics),
    ...DetailFactsModel.integrationFactsOf(ticket, tickets, 'ticket'),
    ...DetailFactsModel.stampFactsOf([['filed', ticket.filed]], format),
    ...withSecondary(DetailFactsModel.stampFactsOf([['started', ticket.started]], format), startedSecondaryOf(liveJob)),
    ...DetailFactsModel.pauseFactsOf(displayState, ownRow, format),
    ...DetailFactsModel.stampFactsOf([
      ['finished', ticket.finished],
      ['reviewed', ownRow?.reviewed],
      [CLOSING_EVENT_WORD.delivered, ticket.delivered],
      [CLOSING_EVENT_WORD.abandoned, ticket.abandonedAt],
    ], format),
    ...DetailFactsModel.textFactsOf([['reason', ticket.reason]]),
    ...DetailFactsModel.heldFactsOf(ticket),
    ...DetailFactsModel.ticketLinksFactsOf('waiting on', waitingOn, 'ticket'),
    ...(ticket.branch === undefined || ticket.branch === '' ? [] : [{
      kind: 'text', label: 'branch', text: ticket.branch, figure: true
    } as const]),
    ...withSecondary(DetailFactsModel.taskFactsOf(ticket), { secondaryText: 'row of this ticket' }),
    ...DetailFactsModel.networkFactsOf(ticket),
  ];
}

function overviewOf(reading: TicketOverviewReading): TicketOverviewModel {
  const { state, ticket, controls } = reading;
  const liveJob = liveJobOf(state.jobs, ticket.id);
  const moves = movesOf(controls, ticket.id, liveJob);
  const lead = leadOf(liveJob, moves);
  const leadMove = lead?.kind === 'move' ? lead.move.move : null;
  return {
    now:             nowCardOf(liveJob, reading),
    lead,
    conflictedFiles: leadMove === 'merge-accept' ? controls.mergeWait?.conflictedFiles ?? [] : [],
    nextSteps:       nextStepsOf(state.ticketForecasts, state.page.tickets, ticket.id),
    otherMoves:      moves.filter((move) => move.move !== leadMove),
    facts:           factsOf(reading, liveJob),
  };
}

export const TicketOverviewModelUtil = Object.freeze({ liveJobOf, nextStepsOf, overviewOf });
