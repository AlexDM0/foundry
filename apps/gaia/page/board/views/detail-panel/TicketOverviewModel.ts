/**
 * The ticket form's Overview, as a model: the state card, the newest open incident, the likely action, the live job's controls, Next, the
 * other moves, the spec and plan, and the facts. The live job is joined here by its `ticketIds`; nothing here decides a step: the
 * forecast, the offered moves and controls and the hold a stop leaves are the forge's, as it serves them.
 */
import type { BoardDocument }                                                  from '../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument, BoardTicketForecastDocument }                  from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardTaskDocument, BoardTicketDocument }                         from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketDocumentSummaryDocument }                             from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardInterruptionCause, BoardTicketPriority } from '../../../@types/board/BoardVocabulary.ts';
import type { BoardDocumentStanding, BoardTicketDocumentKind }                 from '../../../@types/board/BoardVocabulary.ts';
import { BoardRouter, type BoardRoute }                                        from '../../../shared/BoardRouter.ts';
import { CountTextUtil }                                                       from '../../../shared/utils/CountTextUtil.ts';
import type { FlintSlotCue }                                                   from '../../flint/FlintSlotCues.ts';
import { DisplayStateWordingUtil }                                             from '../../utils/DisplayStateWordingUtil.ts';
import { FlintSlotCueUtil }                                                    from '../../utils/FlintSlotCueUtil.ts';
import { JobLiveFactsUtil }                                                    from '../../utils/JobLiveFactsUtil.ts';
import { TimeUtil }                                                            from '../../utils/TimeUtil.ts';
import type { DetailControlsModel, MergeWaitModel }                            from './DetailControlsModel.ts';
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
  'in-customs':   'In Customs',
  'gating':       'Gating',
  'merging-main': 'Merging main',
  'merging':      'Landing',
  'landing':      'Landing',
};

const HEADING_FOR_JOB_KIND: Readonly<Record<string, string>> = {
  'build':       'Building',
  'review':      'Reviewing',
  'merge-agent': 'Resolving',
};

/** A review past its first round runs as a `re-reviewer`. */
const REVIEW_ROLES: ReadonlySet<string> = new Set(['reviewer', 're-reviewer']);

/** The job's role as its controls group names it, `Builder J4 controls`; a job with no role is named by its kind's word. */
const CONTROLS_NAME_OF_ROLE: Readonly<Record<string, string>> = {
  'builder':     'Builder',
  'reviewer':    'Reviewer',
  're-reviewer': 'Re-reviewer',
};

const CONTROLS_NAME_OF_ROLELESS_JOB = 'Job';

const STOPPING_STATE = 'stopping';

/**
 * A job that waits after a network outage or after its forge stopped supervising it heads the card by its cause, in the words of the
 * Agents view, so the card never reads as a failure.
 */
const HEADING_FOR_WAITING_CAUSE: Readonly<Partial<Record<BoardInterruptionCause, string>>> = {
  'network-outage': 'Network outage',
  'lease-ended':    'Not supervised',
};

/** `ticket park` with no incident holds the ticket under this kind (`docs/cli.md`). */
const USER_PARK_HOLD = 'parked:user';

const QUEUED_NOTE = 'In the queue.';

export type TicketMove = 'ready' | 'merge-accept' | 'unhold' | 'merge-update' | 'hold' | 'priority' | 'park' | 'network' | 'deliver-by-hand';

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
  readonly stateToken: BoardDisplayState;
  /** What the job does (`Building`, `In Customs`), or the ticket's state label with no job. */
  readonly heading:    string;
  readonly job:        NowJobModel | null;
  /** With no job: why nothing works on the ticket, `null` when the heading says it all. */
  readonly note:       string | null;
  /** The cue of the card's Flint slot: the live job's, idle with none. */
  readonly flintCue:   FlintSlotCue;
}

/** A move the panel offers; `opens` a field to fill before the move is sent, `sendable` false where Hephaestus would refuse it. */
export interface MoveModel {
  readonly move:        TicketMove;
  readonly label:       string;
  readonly effect:      readonly TextPartModel[];
  readonly opens:       'reason' | 'domains' | 'priorities' | 'by-hand' | null;
  readonly sendable:    boolean;
  /** Set network…'s field starts from the domains stored now. */
  readonly domains?:    readonly string[];
  /** Priority…'s row: one button per priority the ticket may move to. */
  readonly priorities?: readonly BoardTicketPriority[];
}

export type LeadActionModel =
  | { readonly kind: 'watch-job'; readonly jobId: string; readonly effect: readonly TextPartModel[] }
  | { readonly kind: 'move'; readonly move: MoveModel };

export interface NextStepModel {
  readonly key:     string;
  readonly current: boolean;
  readonly parts:   readonly TextPartModel[];
}

/** A move under the job's More menu: Wind down, Stop or Fresh agent, each confirmed in place before its command is sent. */
export type JobStopMove = 'wind-down' | 'stop' | 'fresh';

export interface JobStopItemModel {
  readonly move:         JobStopMove;
  readonly label:        string;
  /** The item's line under its label. */
  readonly description:  string;
  readonly question:     string;
  /** What the move ends and holds, naming the ticket, its branch and the hold it leaves. */
  readonly consequence:  readonly TextPartModel[];
  readonly confirmLabel: string;
}

/** The live job's own controls under Watch: a message to it while it takes one, and its More menu; only `Stopping.` once it stops. */
export interface TicketJobControlsModel {
  readonly jobId:     string;
  /** `Builder J4 controls`. */
  readonly label:     string;
  readonly stopping:  boolean;
  /** A job with a role takes a message. */
  readonly messages:  boolean;
  /** Wind down, Stop and Fresh agent in that order. */
  readonly stopItems: readonly JobStopItemModel[];
}

/** The newest open incident naming the ticket. */
export interface OpenIncidentLineModel {
  readonly incidentId:  string;
  readonly kind:        string;
  readonly defaultMove: string;
}

/** One of the ticket's documents: where it stands and the page that opens it. */
export interface TicketDocumentRowModel {
  readonly document:     BoardTicketDocumentKind;
  readonly title:        string;
  readonly standingText: string;
  readonly route:        BoardRoute;
}

export interface TicketDocumentsModel {
  readonly rows:          readonly TicketDocumentRowModel[];
  /** Said while the documents keep a committed ticket from its build; `null` otherwise. */
  readonly buildHeldText: string | null;
}

export interface TicketOverviewModel {
  readonly now:             NowCardModel;
  readonly openIncident:    OpenIncidentLineModel | null;
  readonly lead:            LeadActionModel | null;
  /** `null` with no live job on the ticket. */
  readonly jobControls:     TicketJobControlsModel | null;
  /** The conflicted files under the lead while the ticket waits for merge; empty otherwise. */
  readonly conflictedFiles: readonly string[];
  /** `null` when the board carries no forecast for the ticket: an older Hephaestus, a closed ticket or a draft. */
  readonly nextSteps:       readonly NextStepModel[] | null;
  readonly otherMoves:      readonly MoveModel[];
  /** `null` on a ticket with no spec and plan. */
  readonly documents:       TicketDocumentsModel | null;
  readonly facts:           readonly DetailFactModel[];
}

/** What the Overview reads of the ticket form's model: the ticket, its board facts and rows, and the controls the panel offers. */
export interface TicketOverviewReading {
  readonly board:        BoardDocument;
  readonly ticket:       BoardTicketDocument;
  readonly displayState: BoardDisplayState;
  readonly waitingOn:    readonly string[];
  readonly ownRow:       BoardTaskDocument | null;
  readonly reviewRows:   readonly BoardTaskDocument[];
  readonly controls:     DetailControlsModel;
  readonly format:       DetailFormat;
}

/** The build, review or merge-agent job working on the ticket: the Playbook keeps at most one on a ticket. */
function liveJobOf(jobs: readonly BoardJobDocument[], ticketId: string): BoardJobDocument | null {
  return jobs.find((job) => TICKET_JOB_KINDS.includes(job.kind) && job.ticketIds.includes(ticketId)) ?? null;
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

function headingOf(job: BoardJobDocument): string {
  const waitingCauseHeading = job.interruption === null ? undefined : HEADING_FOR_WAITING_CAUSE[job.interruption];
  if (waitingCauseHeading !== undefined) return waitingCauseHeading;
  if (Object.hasOwn(HEADING_FOR_JOB_STATE, job.state)) return HEADING_FOR_JOB_STATE[job.state] ?? job.state;
  return Object.hasOwn(HEADING_FOR_JOB_KIND, job.kind) ? HEADING_FOR_JOB_KIND[job.kind] ?? job.kind : job.kind;
}

/** A review counts from its newest review row's start; a build from its own row's newest `in-progress` phase, else the ticket's start. */
function sinceStampOf(job: BoardJobDocument, reading: TicketOverviewReading): string | null {
  if (job.role !== null && REVIEW_ROLES.has(job.role)) return reading.reviewRows.at(-1)?.start ?? null;
  const resumedAt = (reading.ownRow?.history ?? []).findLast((phase) => phase.status === 'in-progress')?.at;
  if (resumedAt !== undefined && resumedAt !== '') return resumedAt;
  return reading.ticket.started;
}

function nowJobOf(job: BoardJobDocument, reading: TicketOverviewReading): NowJobModel {
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

function closedNoteOf(ticket: BoardTicketDocument, format: DetailFormat): string | null {
  if (ticket.status === 'delivered' && ticket.delivered !== null) return `Done at ${DetailFactsModel.stampOf(ticket.delivered, format).shortText}.`;
  if (ticket.status !== 'abandoned') return null;
  if (ticket.reason !== null && ticket.reason !== '') return `Abandoned: ${ticket.reason}`;
  return ticket.abandonedAt === null ? null : `Abandoned at ${DetailFactsModel.stampOf(ticket.abandonedAt, format).shortText}.`;
}

/** Why nothing works on the ticket: held, waiting on its dependencies, waiting for User's accept, queued, or closed. */
function noteOf(reading: TicketOverviewReading): string | null {
  const { ticket, waitingOn, controls } = reading;
  if (ticket.hold !== null) return ticket.hold === '' ? 'Held, with no reason given.' : `Held: ${ticket.hold}`;
  if (waitingOn.length > 0) return `Waits on ${listTextOf(waitingOn.map(idTextOf))}.`;
  if (controls.mergeWait !== undefined) return `Waiting for merge: ${controls.mergeWait.predictionText}.`;
  if (ticket.status === 'committed') return QUEUED_NOTE;
  return closedNoteOf(ticket, reading.format);
}

function nowCardOf(liveJob: BoardJobDocument | null, reading: TicketOverviewReading): NowCardModel {
  const { displayState, ticket } = reading;
  if (liveJob !== null) return {
    stateToken: displayState, heading: headingOf(liveJob), job: nowJobOf(liveJob, reading), note: null, flintCue: FlintSlotCueUtil.cueOfJob(liveJob)
  };
  return {
    stateToken: displayState,
    heading:    DisplayStateWordingUtil.stateLabelOf(displayState, ticket.facts.reviewRound ?? reading.format.limits.firstRepeatReviewRound),
    job:        null,
    note:       noteOf(reading),
    flintCue:   FlintSlotCueUtil.cueOfJob(null),
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
      textOf(mergeWait.accepts ? ', so its Airlock may land it.' : ', so its Airlock may land it. The forge takes no accept of it now.'),
    ],
    opens:    null,
    sendable: mergeWait.accepts,
  };
}

function parkMoveOf(ticketId: string, liveJob: BoardJobDocument | null): MoveModel {
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

/** Work User landed outside Hephaestus; the forge offers it only while no job of the ticket is live. */
function deliverByHandMoveOf(ticketId: string): MoveModel {
  return {
    move:   'deliver-by-hand',
    label:  'Delivered by hand…',
    effect: [
      textOf('Records '),
      emphasisOf(idTextOf(ticketId)),
      textOf(' delivered: work User landed outside Hephaestus. Nothing merges, lands or launches.'),
    ],
    opens:    'by-hand',
    sendable: true,
  };
}

/** Every move the controls offer, in the order the panel lists them; the lead is taken out of them by `overviewOf`. */
function movesOf(controls: DetailControlsModel, ticketId: string, liveJob: BoardJobDocument | null): MoveModel[] {
  const id = idTextOf(ticketId);
  const moves: MoveModel[] = [];
  if (controls.readies) {
    moves.push({
      move:     'ready',
      label:    'Ready',
      effect:   [textOf('Makes '), emphasisOf(id), textOf(' committed with its row, so a builder can take it.')],
      opens:    null,
      sendable: true,
    });
  }
  if (controls.mergeWait !== undefined) moves.push(acceptMoveOf(ticketId, controls.mergeWait));
  if (controls.holdMove === 'unhold') {
    moves.push({
      move:     'unhold',
      label:    'Unhold',
      effect:   [textOf('Lifts the hold on '), emphasisOf(id), textOf('; the step it held starts at Hephaestus\'s next Pass.')],
      opens:    null,
      sendable: true,
    });
  }
  if (controls.mergeWait !== undefined) {
    moves.push({
      move:     'merge-update',
      label:    'Update branch',
      effect:   [textOf('Merges '), figureOf(controls.mergeWait.target), textOf(' into the branch of '), emphasisOf(id), textOf('; Hephaestus gates it again on its next Pass.')],
      opens:    null,
      sendable: controls.mergeWait.updates,
    });
  }
  if (controls.holdMove === 'hold') {
    moves.push({
      move:     'hold',
      label:    'Hold…',
      effect:   [textOf('Holds '), emphasisOf(id), textOf(': Hephaestus launches no builder or reviewer for it until it is unheld.')],
      opens:    'reason',
      sendable: true,
    });
  }
  if (controls.priorityChoices.length > 0) {
    moves.push({
      move:       'priority',
      label:      'Priority…',
      effect:     [textOf('Changes where '), emphasisOf(id), textOf(' waits in Ready: a higher priority is taken first.')],
      opens:      'priorities',
      sendable:   true,
      priorities: controls.priorityChoices,
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
  if (controls.deliversByHand) moves.push(deliverByHandMoveOf(ticketId));
  return moves;
}

/** The one likely action: watch the job at work; else Accept a ticket waiting for merge, Ready a draft, or Unhold a held ticket. */
function leadOf(liveJob: BoardJobDocument | null, moves: readonly MoveModel[]): LeadActionModel | null {
  if (liveJob !== null) return { kind: 'watch-job', jobId: liveJob.id, effect: [textOf(`Opens ${liveJob.id}'s transcript on Agents.`)] };
  const leadMove = moves.find((move) => move.move === 'merge-accept' || move.move === 'ready' || move.move === 'unhold');
  return leadMove === undefined ? null : { kind: 'move', move: leadMove };
}

function ticketLinkOf(ticketId: string): TextPartModel {
  return { kind: 'link', link: { text: idTextOf(ticketId), item: { form: 'ticket', ticketId } } };
}

/** `; #005 Delivery ETA can start, and #012 still waits on #001 and #011`, each ticket a link that opens its ticket form. */
function dependentPartsOf(forecast: BoardTicketForecastDocument, tickets: readonly BoardTicketDocument[]): TextPartModel[] {
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
  return [textOf(`Customs checks ${handoff} and runs ${CountTextUtil.agreeingPhrase(gateCount, 'the gate', 'the gates')}.`)];
}

function landingPartsOf(verb: string, target: string | null): TextPartModel[] {
  return target === null ? [textOf('It lands')] : [textOf(`It ${verb} `), figureOf(target)];
}

/** The forecast's step in words; a customs step with no job of its own names the build job before it, whose handoff it checks. */
function stepPartsOf(step: BoardTicketForecastDocument['steps'][number], ticketId: string, buildJobId: string | null): TextPartModel[] {
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
function nextStepsOf(forecasts: readonly BoardTicketForecastDocument[], tickets: readonly BoardTicketDocument[], ticketId: string): NextStepModel[] | null {
  const forecast = forecasts.find((candidate) => candidate.ticketId === ticketId);
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
function startedSecondaryOf(liveJob: BoardJobDocument | null): Partial<{ secondaryText: string }> {
  return liveJob === null || (liveJob.role !== null && REVIEW_ROLES.has(liveJob.role)) ? {} : { secondaryText: `attempt ${String(liveJob.attempt)}` };
}

function withSecondary(facts: readonly DetailFactModel[], secondary: Partial<{ secondaryText: string }>): DetailFactModel[] {
  return facts.map((fact) => ({ ...fact, ...secondary }));
}

/** The ticket's facts in their fixed order (epics, integration, stamps, pause, closing, reason, held, waiting on, branch, task), network last. */
function factsOf(reading: TicketOverviewReading, liveJob: BoardJobDocument | null): DetailFactModel[] {
  const {
    board, ticket, displayState, waitingOn, ownRow, format
  } = reading;
  const { tickets, facts: pageFacts } = board.page;
  return [
    ...DetailFactsModel.epicFactsOf(ticket, pageFacts.epics),
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
    ...(ticket.branch === null || ticket.branch === '' ? [] : [{
      kind: 'text', label: 'branch', text: ticket.branch, figure: true
    } as const]),
    ...withSecondary(DetailFactsModel.taskFactsOf(ticket), { secondaryText: 'row of this ticket' }),
    ...DetailFactsModel.networkFactsOf(ticket),
  ];
}

function heldPartsOf(ticket: BoardTicketDocument, hold: string): TextPartModel[] {
  const id = emphasisOf(idTextOf(ticket.id));
  if (ticket.hold !== null) return [id, textOf(' keeps its hold'), ...(ticket.hold === '' ? [] : [textOf(' '), figureOf(ticket.hold)]), textOf('.')];
  return [id, textOf(' is held '), figureOf(hold), textOf(' until User unholds it.')];
}

function branchPartsOf(ticket: BoardTicketDocument): TextPartModel[] {
  if (ticket.branch === null || ticket.branch === '') return [];
  return [textOf(' Branch '), figureOf(ticket.branch), textOf(' and its worktree stay as they are. ')];
}

function onTicketPartsOf(ticket: BoardTicketDocument): TextPartModel[] {
  return [textOf(' on '), emphasisOf(idTextOf(ticket.id)), textOf(` ${ticket.title}`)];
}

/** Wind down, Stop and Fresh agent, each worded with what it ends and the hold it leaves. */
function stopItemsOf(job: BoardJobDocument, ticket: BoardTicketDocument): JobStopItemModel[] {
  const id = idTextOf(ticket.id);
  const branchParts = branchPartsOf(ticket);
  const closing = branchParts.length === 0 ? [textOf('. ')] : [textOf('.'), ...branchParts];
  const windDown: JobStopItemModel = {
    move:        'wind-down',
    label:       `Wind down ${job.id}`,
    description: `${job.id} gets a wind-down turn, then ends; ${id} is held.`,
    question:    `Wind down ${job.id}?`,
    consequence: [
      textOf(`${job.id} wraps up its work`),
      ...onTicketPartsOf(ticket),
      textOf(' in a wind-down turn, then ends'),
      ...closing,
      ...heldPartsOf(ticket, job.stopHolds.windDown),
    ],
    confirmLabel: `Wind down ${job.id}`,
  };
  const stop: JobStopItemModel = {
    move:        'stop',
    label:       `Stop ${job.id}`,
    description: `Ends ${job.id}'s session now; ${id} is held.`,
    question:    `Stop ${job.id} now?`,
    consequence: [
      textOf(`Ends ${job.id}'s session`), ...onTicketPartsOf(ticket), textOf(' in the middle of its turn'), ...closing, ...heldPartsOf(ticket, job.stopHolds.stop),
    ],
    confirmLabel: `Stop ${job.id}`,
  };
  if (!job.offers.takesFresh) return [windDown, stop];
  const successor = job.role ?? job.kind;
  const onBranch = ticket.branch === null || ticket.branch === '' ? [textOf(' on its worktree')] : [textOf(' on the worktree of '), figureOf(ticket.branch)];
  return [windDown, stop, {
    move:        'fresh',
    label:       'Fresh agent',
    description: `Ends ${job.id}'s session and starts a new ${successor}${ticket.branch === null || ticket.branch === '' ? '' : ` on ${ticket.branch}`}.`,
    question:    `Start a fresh agent on ${id}?`,
    consequence: [
      textOf(`Ends ${job.id}'s session`),
      ...onTicketPartsOf(ticket),
      textOf(`; a new ${successor} takes the next attempt`),
      ...onBranch,
      textOf(' with the earlier session\'s note. '),
      emphasisOf(id),
      textOf(' is not held.'),
    ],
    confirmLabel: 'Start fresh agent',
  }];
}

function jobControlsOf(job: BoardJobDocument | null, ticket: BoardTicketDocument): TicketJobControlsModel | null {
  if (job === null) return null;
  const roleName = job.role !== null && Object.hasOwn(CONTROLS_NAME_OF_ROLE, job.role) ? CONTROLS_NAME_OF_ROLE[job.role] : undefined;
  return {
    jobId:     job.id,
    label:     `${roleName ?? CONTROLS_NAME_OF_ROLELESS_JOB} ${job.id} controls`,
    stopping:  job.state === STOPPING_STATE || job.stopRequest !== null,
    messages:  job.offers.takesMessage,
    stopItems: stopItemsOf(job, ticket),
  };
}

const DOCUMENT_TITLES: Readonly<Record<BoardTicketDocumentKind, string>> = { spec: 'Spec', plan: 'Plan' };

const STANDING_WORDS: Readonly<Record<BoardDocumentStanding, string>> = {
  'unwritten':              'Not written yet',
  'drafting':               'Being written',
  'awaiting-review':        'Waits for your review',
  'approved':               'Approved',
  'changed-since-approval': 'Changed since its approval',
  'out-of-date':            'Out of date: the spec changed',
};

function standingTextOf(summary: BoardTicketDocumentSummaryDocument): string {
  const words = STANDING_WORDS[summary.standing];
  if (summary.standing === 'approved' && summary.approvedNumber !== null) return `${words} v${summary.approvedNumber}`;
  return summary.headNumber === null || summary.standing === 'unwritten' ? words : `${words} · v${summary.headNumber}`;
}

function documentsOf(ticket: BoardTicketDocument): TicketDocumentsModel | null {
  const { documents } = ticket;
  if (documents === undefined) return null;
  const kinds: readonly BoardTicketDocumentKind[] = ['spec', 'plan'];
  return {
    rows: kinds.map((document) => ({
      document, title: DOCUMENT_TITLES[document], standingText: standingTextOf(documents[document]), route: BoardRouter.documentsRouteOf(ticket.id, document),
    })),
    buildHeldText: documents.buildHeld ? 'The build waits until the spec and plan are in order.' : null,
  };
}

/** The newest open incident listing the ticket: incidents are numbered as they open, so it is the last. */
function openIncidentOf(board: BoardDocument, ticketId: string): OpenIncidentLineModel | null {
  const incident = board.incidents.findLast((candidate) => candidate.ticketIds.includes(ticketId));
  return incident === undefined ? null : { incidentId: incident.id, kind: incident.kind, defaultMove: incident.defaultMove };
}

function overviewOf(reading: TicketOverviewReading): TicketOverviewModel {
  const { board, ticket, controls } = reading;
  const liveJob = liveJobOf(board.jobs, ticket.id);
  const moves = movesOf(controls, ticket.id, liveJob);
  const lead = leadOf(liveJob, moves);
  const leadMove = lead?.kind === 'move' ? lead.move.move : null;
  return {
    now:             nowCardOf(liveJob, reading),
    openIncident:    openIncidentOf(board, ticket.id),
    lead,
    jobControls:     jobControlsOf(liveJob, ticket),
    conflictedFiles: leadMove === 'merge-accept' ? controls.mergeWait?.conflictedFiles ?? [] : [],
    nextSteps:       nextStepsOf(board.ticketForecasts, board.page.tickets, ticket.id),
    otherMoves:      moves.filter((move) => move.move !== leadMove),
    documents:       documentsOf(ticket),
    facts:           factsOf(reading, liveJob),
  };
}

export const TicketOverviewModelUtil = Object.freeze({ liveJobOf, nextStepsOf, overviewOf });
