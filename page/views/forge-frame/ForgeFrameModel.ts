/**
 * What a forge in place shows of a fleet document (SCREENS B1): Gaia's bar over the frame, with the forge's name, its condition, one mono
 * line of what it reports and the controls its condition allows; the Stop question; and what the frame area holds: the Bridge, B3's
 * callout for an Overseer that stopped answering, or the sentence for a forge that cannot be shown inside Gaia. Also where `leave` goes.
 */
import { CONTRACT_VERSIONS }                                   from '../../../src/shared/constants/ContractVersions.ts';
import type { CommandKind, ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentCondition,
  FleetDocumentFidelity,
  FleetDocumentForge
} from '../../@types/FleetDocument.ts';
import type { CommandFailure }                        from '../../api/CommandSender.ts';
import type { ButtonEmphasis }                        from '../../design-system/Button.tsx';
import type { DotCondition }                          from '../../design-system/ConditionDot.tsx';
import { CommandFailureTextUtil, type RefusalText }   from '../../shared/utils/CommandFailureTextUtil.ts';
import { ForgeTextUtil, type UnreachableCalloutText } from '../../shared/utils/ForgeTextUtil.ts';
import { StampTextUtil }                              from '../../shared/utils/StampTextUtil.ts';
import { DEFAULT_ROUTE, type GaiaRoute, HashRouter }  from '../../shell/HashRouter.ts';
import { RailModel }                                  from '../../shell/RailModel.ts';
import type { TopBarStatus }                          from '../../shell/TopBar.tsx';
import { SESSION_LOST_WHILE_OPENING }                 from './ForgeFrameSession.ts';

/** The page's clock as the model reads it: one reading and the time zone a clock time is printed in. */
export interface ForgeFrameClock {
  readonly nowEpochMilliseconds: number;
  readonly timeZone:             string | undefined;
}

export interface BarCommand {
  readonly label:    string;
  readonly emphasis: ButtonEmphasis;
  readonly command:  ForgeCommandBody;
}

export interface StopChoice {
  readonly agents:      ForgeStopAgents;
  readonly title:       string;
  readonly consequence: string;
}

/** B2's Stop question; with no agent running it has no choices and stops the Overseer only. */
export interface StopQuestion {
  readonly label:       string;
  readonly question:    string;
  readonly choices:     readonly StopChoice[];
  readonly consequence: string | null;
}

export interface ForgeBar {
  readonly trackerId:              string;
  readonly status:                 TopBarStatus;
  readonly pauseOrResume:          BarCommand | null;
  readonly stop:                   StopQuestion | null;
  readonly openInNewTab:           ForgeCommandBody;
  /** Pause, Resume and Stop are sent to the forge's control contract; Open in new tab runs the forge program. */
  readonly controlContractIsKnown: boolean;
}

export type ForgeFrameArea =
  | {
    readonly kind:        'frame';
    readonly trackerId:   string;
    readonly project:     string;
    readonly overseerKey: string;
    readonly condition:   DotCondition;
    /** What the area shows when the frame session finds the Overseer gone before the fleet document says so. */
    readonly callout:     UnreachableCalloutText;
  }
  | {
    readonly kind:      'unreachable';
    readonly trackerId: string;
    readonly project:   string;
    readonly condition: DotCondition;
    readonly callout:   UnreachableCalloutText;
  }
  | { readonly kind: 'cannot-show'; readonly trackerId: string; readonly project: string }
  | { readonly kind: 'not-registered'; readonly trackerId: string };

/** A refusal shown under the bar: the forge's code and sentence, and the command Try again sends when the bar can send it again as it was. */
export interface BarRefusal {
  readonly commandLabel: string;
  readonly code:         string;
  readonly sentence:     string;
  readonly tryAgain:     ForgeCommandBody | null;
}

export interface ForgeFrameContent {
  /** `null` for a tracker id the fleet document does not hold. */
  readonly bar:  ForgeBar | null;
  readonly area: ForgeFrameArea;
}

/** The view a forge in place leaves to: the one shown before this forge, kept with the route last seen. */
export interface LeaveTarget {
  readonly lastRoute: GaiaRoute;
  readonly fragment:  string;
}

const LINE_SEPARATOR = ' · ';

const FORGE_COMMAND_LABELS: Readonly<Record<ForgeCommandBody['kind'], string>> = {
  'forge-start':           'Start',
  'forge-pause':           'Pause',
  'forge-resume':          'Resume',
  'forge-restart':         'Restart',
  'forge-update':          'Update forge',
  'forge-open-in-browser': 'Open in new tab',
  'forge-hide':            'Hide in Gaia',
  'forge-unhide':          'Show again',
  'forge-stop':            'Stop',
  'forge-concurrency-set': 'the agent limit',
};

/** The bar's commands that carry nothing but the forge, so Try again can send them as they were; Stop asks its question again instead. */
type KindSentAgainAsItWas = 'forge-pause' | 'forge-resume' | 'forge-open-in-browser';

const SENT_AGAIN_AS_THEY_WERE: ReadonlySet<CommandKind> = new Set<KindSentAgainAsItWas>(['forge-pause', 'forge-resume', 'forge-open-in-browser']);

/** Gaia's own reasons for no frame session, worded where the forge sent no sentence. */
const FRAME_SESSION_REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  'forge-not-registered':       'The registry does not name this forge.',
  'token-unreadable':           'Gaia could not read this forge\'s token.',
  'token-rejected':             'The forge did not accept Gaia\'s token.',
  'server-unreachable':         'Gaia\'s server could not be reached.',
  'answer-not-understood':      'Gaia\'s server gave an answer this page does not understand.',
  [SESSION_LOST_WHILE_OPENING]: 'The Bridge lost its session as it opened.',
};

const FRAME_SESSION_REFUSED_SENTENCE = 'Gaia could not open a session in this forge.';

const PAUSABLE: ReadonlySet<FleetDocumentCondition> = new Set(['live']);
const RESUMABLE: ReadonlySet<FleetDocumentCondition> = new Set(['paused']);
const STOPPABLE: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'unreachable']);

/** The fidelities at which the forge reported its agents, the last reading of one that stopped answering included. */
const AGENTS_ARE_REPORTED_AT: ReadonlySet<FleetDocumentFidelity> = new Set<FleetDocumentFidelity>(['full', 'counts-only', 'unreachable']);

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

function inSentenceCase(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function clockTextOf(stamp: string | null, clock: ForgeFrameClock): string | null {
  return stamp === null ? null : StampTextUtil.clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone);
}

function agentsRunningOf(forge: FleetDocumentForge): number {
  return forge.concurrency?.agentsInFlight ?? forge.agents.length;
}

/** What waits on User from this forge; a forge read through its summary reports only the count. */
function waitingCountOf(forge: FleetDocumentForge): number | null {
  return forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
}

/** A forge Gaia reads nothing of, dormant, gone or newer than this Gaia, reports no agents: their count is absent, not zero. */
function agentsTextOf(forge: FleetDocumentForge): string | null {
  if (!AGENTS_ARE_REPORTED_AT.has(forge.fidelity)) return null;
  const { concurrency } = forge;
  return concurrency === null
    ? countedPhrase(forge.agents.length, 'agent', 'agents')
    : `${concurrency.agentsInFlight} / ${countedPhrase(concurrency.limit, 'agent', 'agents')}`;
}

/** The mono line: agents, what waits, usage and since; a forge that stopped answering says first that this is what it last reported. */
function statusTextOf(forge: FleetDocumentForge, clock: ForgeFrameClock): string {
  const waitingCount = waitingCountOf(forge);
  const startedClock = clockTextOf(forge.overseerStartedAt, clock);
  const lastReportedClock = clockTextOf(forge.lastReportedAt, clock);
  const asLastReported = lastReportedClock === null ? 'as last reported' : `as last reported ${lastReportedClock}`;
  return [
    forge.fidelity === 'unreachable' ? asLastReported : null,
    agentsTextOf(forge),
    waitingCount === null || waitingCount === 0 ? null : countedPhrase(waitingCount, 'waits on you', 'wait on you'),
    forge.usage === null ? null : `usage ${ForgeTextUtil.usageTextOf(forge.usage, (stamp) => clockTextOf(stamp, clock) ?? stamp)}`,
    startedClock === null ? null : `since ${startedClock}`,
  ].filter((part) => part !== null).join(LINE_SEPARATOR);
}

function pauseOrResumeOf(forge: FleetDocumentForge): BarCommand | null {
  const { trackerId } = forge;
  if (PAUSABLE.has(forge.condition)) return { label: 'Pause', emphasis: 'plain', command: { kind: 'forge-pause', trackerId } };
  if (RESUMABLE.has(forge.condition)) return { label: 'Resume', emphasis: 'primary', command: { kind: 'forge-resume', trackerId } };
  return null;
}

function stopChoicesOf(agentsRunning: number): StopChoice[] {
  if (agentsRunning === 0) return [];
  const theAgents = agentsRunning === 1 ? 'The agent' : `The ${agentsRunning} agents`;
  return [
    {
      agents:      'keep',
      title:       'Stop the Overseer only',
      consequence: `${theAgents} ${agentsRunning === 1 ? 'finishes what it is on under its Watcher' : 'finish what they are on under their Watchers'}. `
        + 'Nothing new starts until this forge is started again.',
    },
    {
      agents:      'stop-first',
      title:       'Stop the agents, then the Overseer',
      consequence: `${theAgents} ${agentsRunning === 1 ? 'winds down first and its tickets return' : 'wind down first and their tickets return'} to the board. `
        + 'Then the Overseer stops.',
    },
  ];
}

function stopQuestionOf(forge: FleetDocumentForge): StopQuestion | null {
  if (!STOPPABLE.has(forge.condition)) return null;
  const agentsRunning = agentsRunningOf(forge);
  const waitingCount = waitingCountOf(forge);
  const running = agentsRunning === 0 ? '' : ` ${countedPhrase(agentsRunning, 'agent is', 'agents are')} running.`;
  return {
    label:       `Stop ${forge.project}`,
    question:    `Stop the Overseer of ${forge.project}?${running}`,
    choices:     stopChoicesOf(agentsRunning),
    consequence: waitingCount === null || waitingCount === 0
      ? null
      : `${countedPhrase(waitingCount, 'entry keeps', 'entries keep')} waiting on you while it is stopped.`,
  };
}

function barOf(forge: FleetDocumentForge, clock: ForgeFrameClock): ForgeBar {
  return {
    trackerId: forge.trackerId,
    status:    {
      condition: ForgeTextUtil.dotConditionOf(forge.condition),
      word:      inSentenceCase(ForgeTextUtil.conditionWordOf(forge.condition)),
      text:      statusTextOf(forge, clock),
    },
    pauseOrResume:          pauseOrResumeOf(forge),
    stop:                   stopQuestionOf(forge),
    openInNewTab:           { kind: 'forge-open-in-browser', trackerId: forge.trackerId },
    controlContractIsKnown: forge.contracts.control === CONTRACT_VERSIONS.forgeControl,
  };
}

/** The Overseer the frame's session belongs to: a new address or a new start is a new Overseer, which needs a new frame session. */
function overseerKeyOf(forge: FleetDocumentForge): string {
  return `${forge.url ?? ''} ${forge.overseerStartedAt ?? ''}`;
}

/** An Overseer that stopped answering shows B3's callout first: its last reading may still name an embed channel it no longer serves. */
function areaOf(trackerId: string, forge: FleetDocumentForge | undefined, clock: ForgeFrameClock): ForgeFrameArea {
  if (forge === undefined) return { kind: 'not-registered', trackerId };
  const { project } = forge;
  const condition = ForgeTextUtil.dotConditionOf(forge.condition);
  const callout = ForgeTextUtil.unreachableCalloutTextOf(forge, clockTextOf(forge.lastReportedAt, clock));
  if (forge.fidelity === 'unreachable') return {
    kind: 'unreachable', trackerId, project, condition, callout,
  };
  if (forge.fidelity === 'full' && RailModel.canOpenInPlace(forge)) return {
    kind: 'frame', trackerId, project, overseerKey: overseerKeyOf(forge), condition, callout,
  };
  return { kind: 'cannot-show', trackerId, project };
}

function forgeFrameContentOf(trackerId: string, fleetDocument: FleetDocument, clock: ForgeFrameClock): ForgeFrameContent {
  const forge = fleetDocument.forges.find((candidate) => candidate.trackerId === trackerId);
  return { bar: forge === undefined ? null : barOf(forge, clock), area: areaOf(trackerId, forge, clock) };
}

function forgeCommandKindIs(kind: CommandKind): kind is ForgeCommandBody['kind'] {
  return Object.hasOwn(FORGE_COMMAND_LABELS, kind);
}

function kindIsSentAgainAsItWas(kind: CommandKind): kind is KindSentAgainAsItWas {
  return SENT_AGAIN_AS_THEY_WERE.has(kind);
}

function barRefusalOf(trackerId: string, failure: CommandFailure | null): BarRefusal | null {
  if (failure === null || !forgeCommandKindIs(failure.kind)) return null;
  const { kind } = failure;
  return {
    commandLabel: FORGE_COMMAND_LABELS[kind],
    ...CommandFailureTextUtil.refusalTextOf(failure),
    tryAgain:     kindIsSentAgainAsItWas(kind) ? { kind, trackerId } : null,
  };
}

/** The forge's own sentence when it sent one, else Gaia's for its own reason, read through an own-property check. */
function frameSessionRefusalTextOf(refusal: string, text: string | null): RefusalText {
  const ownSentence = Object.hasOwn(FRAME_SESSION_REFUSAL_SENTENCES, refusal) ? FRAME_SESSION_REFUSAL_SENTENCES[refusal] : undefined;
  return { code: refusal, sentence: text ?? ownSentence ?? FRAME_SESSION_REFUSED_SENTENCE };
}

function initialLeaveTarget(route: GaiaRoute): LeaveTarget {
  return { lastRoute: route, fragment: HashRouter.fragmentOf(DEFAULT_ROUTE) };
}

/**
 * Entering a forge in place from any other view, another forge included, remembers that view; moving within the forge keeps it. The same
 * target comes back, the very object, when the route did not change, so a caller can tell.
 */
function leaveTargetAfter(target: LeaveTarget, route: GaiaRoute): LeaveTarget {
  if (route === target.lastRoute) return target;
  const { lastRoute } = target;
  const entersAnotherForge = route.view === 'forge' && (lastRoute.view !== 'forge' || lastRoute.trackerId !== route.trackerId);
  return { lastRoute: route, fragment: entersAnotherForge ? HashRouter.fragmentOf(lastRoute) : target.fragment };
}

export const ForgeFrameModel = {
  forgeFrameContentOf,
  barRefusalOf,
  frameSessionRefusalTextOf,
  initialLeaveTarget,
  leaveTargetAfter,
} as const;
