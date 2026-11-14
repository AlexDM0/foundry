/**
 * What a forge in place shows of a fleet document (SCREENS B1): Gaia's bar over the frame, with the forge's name, its condition, one short
 * line of what it reports and the controls its condition allows; the Stop question; and what the frame area holds: the Bridge, B3's
 * callout for an Overseer that stopped answering, or the sentence for a forge that cannot be shown inside Gaia. Also Flint's brain in the bar,
 * in the state the forge reports, with a wake refused here in its place, and where `leave` goes.
 */
import type { ButtonEmphasis } from 'design-system/Button';

import type { CommandKind, ForgeCommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentBrain,
  FleetDocumentBrainState,
  FleetDocumentCondition,
  FleetDocumentFidelity,
  FleetDocumentForge,
} from '../../@types/FleetDocument.ts';
import type { CommandFailure }                        from '../../api/CommandSender.ts';
import type { DotCondition }                          from '../../design-system/ConditionDot.tsx';
import type { RefusedBy }                             from '../../design-system/Refusal.tsx';
import { CommandFailureTextUtil, type RefusalText }   from '../../shared/utils/CommandFailureTextUtil.ts';
import { ForgeCommandTextUtil, type StopQuestion }    from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }                          from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil, type UnreachableCalloutText } from '../../shared/utils/ForgeTextUtil.ts';
import { StampTextUtil }                              from '../../shared/utils/StampTextUtil.ts';
import { DEFAULT_ROUTE, type GaiaRoute, HashRouter }  from '../../shell/HashRouter.ts';
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

/** A run of the bar's line: words, or a figure the forge reported, which is set in mono. */
export interface BarLineSegment {
  readonly text:     string;
  readonly isFigure: boolean;
}

/**
 * The bar's status: the condition's dot and its word, so the dot is never the only sign; the line it shows, agents and what waits, kept
 * short so the bar stays on one line beside the brain's group (D2); and `text`, the whole reading with usage and since, for its tooltip.
 */
export interface ForgeBarStatus {
  readonly condition: DotCondition;
  readonly word:      string;
  readonly line:      readonly BarLineSegment[];
  readonly text:      string;
}

/** What the bar's brain group shows, each figure already worded; the time left is counted for display only. */
export type BarBrainShown =
  | { readonly state: 'off' }
  | { readonly state: 'starting' }
  | {
    readonly state:     'running';
    readonly model:     string;
    readonly effort:    string;
    readonly countdown: string;
    readonly tokens:    string;
  }
  | { readonly state: 'refused'; readonly refusedBy: RefusedBy; readonly code: string; readonly sentence: string }
  | { readonly state: 'ended'; readonly sentence: string };

/** Flint's brain as the forge reports it; Wake, Stop and the mark's double click only where the forge's control contract carries them. */
export interface BarBrain {
  readonly shown:             BarBrainShown;
  readonly controlsAreServed: boolean;
}

export interface ForgeBar {
  readonly trackerId:              string;
  readonly project:                string;
  readonly status:                 ForgeBarStatus;
  readonly pauseOrResume:          BarCommand | null;
  readonly stop:                   StopQuestion | null;
  readonly openInNewTab:           ForgeCommandBody;
  /** Pause, Resume and Stop are sent to the forge's control contract; Open in new tab runs the forge program. */
  readonly controlContractIsKnown: boolean;
  /** `null` for a forge that reports no brain: its monitor is older than contract 3, or it has no Flint. */
  readonly brain:                  BarBrain | null;
}

export type ForgeFrameArea =
  | {
    readonly kind:        'frame';
    readonly trackerId:   string;
    readonly project:     string;
    readonly overseerKey: string;
    /** What the area shows when the frame session finds the Overseer gone before the fleet document says so. */
    readonly callout:     UnreachableCalloutText;
  }
  | {
    readonly kind:      'unreachable';
    readonly trackerId: string;
    readonly project:   string;
    readonly callout:   UnreachableCalloutText;
  }
  | { readonly kind: 'cannot-show'; readonly trackerId: string; readonly project: string }
  | { readonly kind: 'not-registered'; readonly trackerId: string };

/** A refusal shown under the bar: the forge's code and sentence, and the command Try again sends when the bar can send it again as it was. */
export interface BarRefusal extends RefusalText {
  readonly commandLabel: string;
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

/** The bar's commands that carry nothing but the forge, so Try again can send them as they were; Stop asks its question again instead. */
type KindSentAgainAsItWas = 'forge-pause' | 'forge-resume' | 'forge-open-in-browser' | 'forge-brain-stop';

const SENT_AGAIN_AS_THEY_WERE: ReadonlySet<CommandKind> = new Set<KindSentAgainAsItWas>(['forge-pause', 'forge-resume', 'forge-open-in-browser', 'forge-brain-stop']);

/** A refused wake shows in the brain's group, where it was asked, beside Wake; not under the bar as well. */
const SHOWN_IN_THE_BRAIN_GROUP: ReadonlySet<CommandKind> = new Set<CommandKind>(['forge-brain-start']);

/** The states in which Wake shows and the forge mark's double click wakes the brain (SCREENS B1). */
const BRAIN_WAKES_FROM: ReadonlySet<FleetDocumentBrainState> = new Set<FleetDocumentBrainState>(['off', 'refused', 'ended']);

const WAKE_BY_DOUBLE_CLICK_TITLE = 'Double-click to wake Flint\'s brain';

/** The forge mark's title where its double click does not wake the brain, as artboard B1 words them. */
const MARK_TITLES_WHILE_AWAKE: Readonly<Partial<Record<FleetDocumentBrainState, string>>> = {
  starting: 'Flint\'s brain is waking',
  running:  'Flint\'s brain is awake',
};

/** Gaia's words for a refusal whose sentence names a command (D10), by the codes of control contract 2 (G3), read after "The forge refused:". */
const BRAIN_REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  'no-flint':              'this forge has no Flint',
  'brain-already-running': 'Flint\'s brain is already awake',
  'brain-not-running':     'Flint\'s brain is not awake',
  'usage-limit-holds':     'launches are held until the usage limit resets',
  'overseer-paused':       'the Overseer is paused',
  'brain-failed-to-start': 'Flint\'s brain did not start',
};

const BRAIN_REFUSED_SENTENCE = 'Flint\'s brain did not wake';

const BRAIN_ENDED_SENTENCE = 'Flint\'s brain stopped';

/** A figure of a running brain the forge did not report. */
const UNREPORTED_FIGURE = '–';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const ONE_THOUSAND = 1_000;
const ONE_MILLION = 1_000_000;
const SIGNIFICANT_DIGITS_OF_A_TOKEN_COUNT = 3;

/** Gaia's own reasons for no frame session, worded where the forge sent no sentence. */
const FRAME_SESSION_REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  'forge-not-registered':       'The registry does not name this forge.',
  'registry-unreadable':        'Gaia could not read the forges\' registry.',
  'registry-newer-version':     'The forges\' registry is newer than this Gaia reads.',
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

function clockTextOf(stamp: string | null, clock: ForgeFrameClock): string | null {
  return stamp === null ? null : StampTextUtil.clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone);
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

/**
 * The tooltip's usage names only a limit that was hit, without its window; usage under its limit is no news there, nor is the last reading
 * of a forge that stopped answering, which says "as last reported" and since.
 */
function usageTextOf(forge: FleetDocumentForge, clock: ForgeFrameClock): string | null {
  const { usage } = forge;
  if (forge.fidelity === 'unreachable' || usage === null || usage.resetsAt === null) return null;
  return `usage limit hit · resets ${clockTextOf(usage.resetsAt, clock) ?? usage.resetsAt}`;
}

/** The whole reading for the tooltip: agents, what waits, a usage limit hit and since, after "as last reported" for a forge that stopped answering. */
function statusTextOf(forge: FleetDocumentForge, clock: ForgeFrameClock): string {
  const waitingCount = waitingCountOf(forge);
  const startedClock = clockTextOf(forge.overseerStartedAt, clock);
  const lastReportedClock = clockTextOf(forge.lastReportedAt, clock);
  const asLastReported = lastReportedClock === null ? 'as last reported' : `as last reported ${lastReportedClock}`;
  return [
    forge.fidelity === 'unreachable' ? asLastReported : null,
    agentsTextOf(forge),
    waitingCount === null || waitingCount === 0 ? null : countedPhrase(waitingCount, 'waits on you', 'wait on you'),
    usageTextOf(forge, clock),
    startedClock === null ? null : `since ${startedClock}`,
  ].filter((part) => part !== null).join(LINE_SEPARATOR);
}

function wordsOf(text: string): BarLineSegment {
  return { text, isFigure: false };
}

function figureOf(text: string): BarLineSegment {
  return { text, isFigure: true };
}

function agentsLineOf(forge: FleetDocumentForge): readonly BarLineSegment[] | null {
  if (!AGENTS_ARE_REPORTED_AT.has(forge.fidelity)) return null;
  const { concurrency } = forge;
  return concurrency === null
    ? [figureOf(String(forge.agents.length)), wordsOf(forge.agents.length === 1 ? ' agent' : ' agents')]
    : [figureOf(`${concurrency.agentsInFlight} / ${concurrency.limit}`), wordsOf(concurrency.limit === 1 ? ' agent' : ' agents')];
}

/** The line the bar shows: what `statusTextOf` says but usage and since, with the figures apart from the words. */
function statusLineOf(forge: FleetDocumentForge, clock: ForgeFrameClock): readonly BarLineSegment[] {
  const waitingCount = waitingCountOf(forge);
  const lastReportedClock = clockTextOf(forge.lastReportedAt, clock);
  const asLastReported = lastReportedClock === null ? [wordsOf('as last reported')] : [wordsOf('as last reported '), figureOf(lastReportedClock)];
  const parts = [
    forge.fidelity === 'unreachable' ? asLastReported : null,
    agentsLineOf(forge),
    waitingCount === null || waitingCount === 0 ? null : [figureOf(String(waitingCount)), wordsOf(waitingCount === 1 ? ' waits on you' : ' wait on you')],
  ].filter((part) => part !== null);
  return parts.flatMap((part, i) => (i === 0 ? part : [wordsOf(LINE_SEPARATOR), ...part]));
}

function pauseOrResumeOf(forge: FleetDocumentForge): BarCommand | null {
  const { trackerId } = forge;
  if (PAUSABLE.has(forge.condition)) return { label: 'Pause', emphasis: 'quiet', command: { kind: 'forge-pause', trackerId } };
  if (RESUMABLE.has(forge.condition)) return { label: 'Resume', emphasis: 'primary', command: { kind: 'forge-resume', trackerId } };
  return null;
}

function stopQuestionOf(forge: FleetDocumentForge): StopQuestion | null {
  return STOPPABLE.has(forge.condition) ? ForgeCommandTextUtil.stopQuestionOf(forge) : null;
}

function roundedToTokenCountDigitsOf(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS_OF_A_TOKEN_COUNT));
}

/** 3100 as `3.1k`, 1240000 as `1.24M`: three significant digits, as artboard B1 writes the brain's tokens. */
function tokenCountTextOf(tokens: number): string {
  if (tokens < ONE_THOUSAND) return String(tokens);
  const thousands = roundedToTokenCountDigitsOf(tokens / ONE_THOUSAND);
  if (thousands < ONE_THOUSAND) return `${thousands}k`;
  return `${roundedToTokenCountDigitsOf(tokens / ONE_MILLION)}M`;
}

/**
 * The time left to the forge's `endsAt` as `1:24`, whole seconds rounded up, and `0:00` once it passed: the brain stays until the forge
 * reports it ended. Reading the clock against `endsAt` is a stated clock exception (PLAN B6): it decides only the text printed.
 */
function countdownTextOf(endsAt: string | null, clock: ForgeFrameClock): string {
  const endsAtEpochMilliseconds = endsAt === null ? Number.NaN : Date.parse(endsAt);
  if (Number.isNaN(endsAtEpochMilliseconds)) return UNREPORTED_FIGURE;
  const secondsLeft = Math.max(0, Math.ceil((endsAtEpochMilliseconds - clock.nowEpochMilliseconds) / MILLISECONDS_PER_SECOND));
  return `${Math.floor(secondsLeft / SECONDS_PER_MINUTE)}:${String(secondsLeft % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

function brainRefusalSentenceOf(code: string, sentence: string | null): string {
  const ownSentence = Object.hasOwn(BRAIN_REFUSAL_SENTENCES, code) ? BRAIN_REFUSAL_SENTENCES[code] : undefined;
  return sentence ?? ownSentence ?? BRAIN_REFUSED_SENTENCE;
}

function brainEndedSentenceOf(brain: FleetDocumentBrain): string {
  if (brain.sentence !== null) return brain.sentence;
  return brain.tokens === null ? BRAIN_ENDED_SENTENCE : `${BRAIN_ENDED_SENTENCE} · ${tokenCountTextOf(brain.tokens)} tokens`;
}

function brainShownOf(brain: FleetDocumentBrain, clock: ForgeFrameClock): BarBrainShown {
  switch (brain.state) {
    case 'off':
    case 'starting':
      return { state: brain.state };
    case 'running':
      return {
        state:     'running',
        model:     brain.model ?? UNREPORTED_FIGURE,
        effort:    brain.effort ?? UNREPORTED_FIGURE,
        countdown: countdownTextOf(brain.endsAt, clock),
        tokens:    brain.tokens === null ? UNREPORTED_FIGURE : tokenCountTextOf(brain.tokens),
      };
    case 'refused': {
      const code = brain.refusal?.code ?? 'refused';
      return {
        state: 'refused', refusedBy: 'forge', code, sentence: brainRefusalSentenceOf(code, brain.refusal?.sentence ?? null)
      };
    }
    case 'ended':
      return { state: 'ended', sentence: brainEndedSentenceOf(brain) };
  }
}

function barBrainOf(forge: FleetDocumentForge, clock: ForgeFrameClock): BarBrain | null {
  const { brain } = forge;
  if (brain === 'not-reported') return null;
  return { shown: brainShownOf(brain, clock), controlsAreServed: ForgeContractUtil.brainCommandsAreServed(forge) };
}

function barOf(forge: FleetDocumentForge, clock: ForgeFrameClock): ForgeBar {
  return {
    trackerId: forge.trackerId,
    project:   forge.project,
    status:    {
      condition: ForgeTextUtil.dotConditionOf(forge.condition),
      word:      ForgeTextUtil.conditionWordInSentenceCaseOf(forge.condition),
      line:      statusLineOf(forge, clock),
      text:      statusTextOf(forge, clock),
    },
    pauseOrResume:          pauseOrResumeOf(forge),
    stop:                   stopQuestionOf(forge),
    openInNewTab:           { kind: 'forge-open-in-browser', trackerId: forge.trackerId },
    controlContractIsKnown: ForgeContractUtil.controlContractIsKnown(forge),
    brain:                  barBrainOf(forge, clock),
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
  const callout = ForgeTextUtil.unreachableCalloutTextOf(forge, clockTextOf(forge.lastReportedAt, clock));
  if (forge.fidelity === 'unreachable') return {
    kind: 'unreachable', trackerId, project, callout,
  };
  if (forge.fidelity === 'full' && ForgeContractUtil.canOpenInPlace(forge)) return {
    kind: 'frame', trackerId, project, overseerKey: overseerKeyOf(forge), callout,
  };
  return { kind: 'cannot-show', trackerId, project };
}

function forgeFrameContentOf(trackerId: string, fleetDocument: FleetDocument, clock: ForgeFrameClock): ForgeFrameContent {
  const forge = fleetDocument.forges.find((candidate) => candidate.trackerId === trackerId);
  return { bar: forge === undefined ? null : barOf(forge, clock), area: areaOf(trackerId, forge, clock) };
}

function kindIsSentAgainAsItWas(kind: CommandKind): kind is KindSentAgainAsItWas {
  return SENT_AGAIN_AS_THEY_WERE.has(kind);
}

function barRefusalOf(trackerId: string, failure: CommandFailure | null): BarRefusal | null {
  const commandLabel = failure === null ? null : ForgeCommandTextUtil.commandLabelOf(failure.kind);
  if (failure === null || commandLabel === null || SHOWN_IN_THE_BRAIN_GROUP.has(failure.kind)) return null;
  const { kind } = failure;
  return {
    commandLabel,
    ...CommandFailureTextUtil.refusalTextOf(failure),
    tryAgain: kindIsSentAgainAsItWas(kind) ? { kind, trackerId } : null,
  };
}

/**
 * What the brain's group shows now: a wake refused here, while the forge reports a brain that may be woken, in place of the forge's state;
 * the forge's state once it reports the brain waking or awake, since the refusal is then out of date.
 */
function brainShownAfter(brain: BarBrain, failure: CommandFailure | null): BarBrainShown {
  if (failure === null || failure.kind !== 'forge-brain-start' || !BRAIN_WAKES_FROM.has(brain.shown.state)) return brain.shown;
  const { result } = failure;
  if (result.verdict === 'answered' && result.answer.refusal !== null) {
    return { state: 'refused', ...CommandFailureTextUtil.refusalTextOf(failure), sentence: brainRefusalSentenceOf(result.answer.refusal, result.answer.text) };
  }
  return { state: 'refused', ...CommandFailureTextUtil.refusalTextOf(failure) };
}

/** A wake refused here is out of date once the forge reports its brain waking or awake, whichever route woke it, and is then dismissed. */
function brainWakeRefusalIsOutOfDate(brain: BarBrain | null, failure: CommandFailure | null): boolean {
  return brain !== null && failure?.kind === 'forge-brain-start' && !BRAIN_WAKES_FROM.has(brain.shown.state);
}

/** The forge mark's part in the brain (PLAN B2): a double click wakes it where Wake would; otherwise its title says how the brain is, if awake. */
export interface BarMarkWake {
  readonly title:      string | null;
  readonly wakesBrain: boolean;
}

function markWakeOf(brain: BarBrain | null, shown: BarBrainShown | null): BarMarkWake {
  if (brain === null || shown === null) return { title: null, wakesBrain: false };
  const wakesBrain = brain.controlsAreServed && BRAIN_WAKES_FROM.has(shown.state);
  return { title: wakesBrain ? WAKE_BY_DOUBLE_CLICK_TITLE : MARK_TITLES_WHILE_AWAKE[shown.state] ?? null, wakesBrain };
}

/** The forge's own sentence when it sent one, else Gaia's for its own reason, read through an own-property check. */
function frameSessionRefusalTextOf(refusal: string, text: string | null): RefusalText {
  const ownSentence = Object.hasOwn(FRAME_SESSION_REFUSAL_SENTENCES, refusal) ? FRAME_SESSION_REFUSAL_SENTENCES[refusal] : undefined;
  return { refusedBy: ownSentence === undefined ? 'forge' : 'gaia', code: refusal, sentence: text ?? ownSentence ?? FRAME_SESSION_REFUSED_SENTENCE };
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
  brainShownAfter,
  brainWakeRefusalIsOutOfDate,
  markWakeOf,
  frameSessionRefusalTextOf,
  initialLeaveTarget,
  leaveTargetAfter,
} as const;
