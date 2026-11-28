/**
 * What a forge in place shows of a fleet document (`docs/design/screens.md`, "A forge in place"): Gaia's bar with its allowed controls, the Stop
 * question, an older forge's Update forge steps, and what the area under the bar holds. While its board is in setup a forge Gaia talks to shows a
 * quieter bar with its rare controls in one menu.
 */

import type { CommandKind, ForgeCommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentCondition,
  FleetDocumentFidelity,
  FleetDocumentForge,
  FleetDocumentRunningVersions,
} from '../../@types/FleetDocument.ts';
import type { CommandFailure, CommandState }        from '../../api/CommandSender.ts';
import type { DotCondition }                        from '../../components/ConditionDot.tsx';
import type { RefusedBy }                           from '../../components/Refusal.tsx';
import type { ButtonEmphasis }                      from '../../lib/design-system/DesignSystemInterface.ts';
import type { ClockReading }                        from '../../shared/@types/ClockReading.ts';
import { CommandFailureTextUtil, type RefusalText } from '../../shared/utils/CommandFailureTextUtil.ts';
import { CountTextUtil }                            from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }                        from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeCommandTextUtil, type StopQuestion }  from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }                        from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                            from '../../shared/utils/ForgeTextUtil.ts';
import {
  ForgeVersionsTextUtil,
  type ForgeWithVersions,
  type GaiaVersions,
  type VersionsNoticeText,
  type VersionsPairText,
  type VersionsText,
} from '../../shared/utils/ForgeVersionsTextUtil.ts';
import { PathTextUtil }  from '../../shared/utils/PathTextUtil.ts';
import { StampTextUtil } from '../../shared/utils/StampTextUtil.ts';

export interface BarCommand {
  readonly label:    string;
  readonly emphasis: ButtonEmphasis;
  readonly command:  ForgeCommandBody;
}

/** A run of the bar's line: words, a figure the forge reported, set in mono, or a system version, set in mono in ink as everywhere. */
export interface BarLineSegment {
  readonly text: string;
  readonly look: 'words' | 'figure' | 'version';
}

/**
 * The bar's status: the condition's dot and its word, so the dot is never the only sign; the line it shows, agents and what waits, kept
 * short so the bar stays short; and `text`, the whole reading with usage and since, for its tooltip.
 */
export interface ForgeBarStatus {
  readonly condition: DotCondition;
  readonly word:      string;
  readonly line:      readonly BarLineSegment[];
  readonly text:      string;
}

/** The verdicts at which Gaia cannot talk to a forge: newer than this Gaia, or older and waiting on Update forge. */
export type CannotTalkVerdict = 'newer' | 'older';

/** A forge Gaia cannot talk to: the controls it cannot send show disabled, their title naming both versions; an older one offers Update forge. */
export interface BarCannotTalk {
  readonly verdict:            CannotTalkVerdict;
  readonly unsentControls:     readonly string[];
  readonly unsentControlTitle: string;
}

/** Update forge, step by step, in the bar of an older forge; a refusal shows there in one line, its whole sentence in `wholeSentence`. */
export type BarUpdateStep =
  | { readonly step: 'idle' | 'pending' | 'done' }
  | { readonly step: 'refused'; readonly lead: string; readonly code: string; readonly sentence: string; readonly wholeSentence: string };

/**
 * One running and newest pair of the bar's versions line: the component, its line (the running version, and the newest installed one
 * where it differs), whether a newer version is installed, which marks the pair and restarts nothing, and the whole reading for its title.
 */
export interface BarVersionPair {
  readonly component:        'Hephaestus' | 'Talos';
  readonly line:             readonly BarLineSegment[];
  readonly newerIsInstalled: boolean;
  readonly title:            string;
}

/**
 * The running and the newest Hephaestus and Talos, and a clean restart of each: Restart Hephaestus is the checked restart to the code on
 * disk, Restart Talos its clean quit. `pairs` is empty for a forge not answering, whose versions are not known; the restarts act only
 * while the forge answers.
 */
export interface BarVersions {
  readonly pairs:             readonly BarVersionPair[];
  readonly restartHephaestus: BarCommand;
  readonly restartTalos:      BarCommand;
  readonly restartsMayAct:    boolean;
}

export interface ForgeBar {
  readonly trackerId:              string;
  readonly project:                string;
  /** The forge's repository, from `~` under the home folder. */
  readonly root:                   string;
  /** The setup bar says the forge's condition only while it is not live: paused, held, restarting or not answering. */
  readonly conditionIsLive:        boolean;
  readonly status:                 ForgeBarStatus;
  readonly pauseOrUnpause:         BarCommand | null;
  readonly stop:                   StopQuestion | null;
  /** Pause, Unpause and Stop are sent to the forge's control contract. */
  readonly controlContractIsKnown: boolean;
  /** `null` for a forge Gaia talks to; then Pause, Unpause and Stop follow the forge's condition. */
  readonly cannotTalk:             BarCannotTalk | null;
  /** `null` for a forge Gaia cannot talk to, which it can restart neither way. */
  readonly versions:               BarVersions | null;
}

/** `board`: a forge read in full or as a Hephaestus that stopped answering last reported it, whose board Gaia's relay reads. */
export type ForgeArea =
  | { readonly kind: 'board'; readonly trackerId: string; readonly project: string }
  | {
    readonly kind:      'cannot-talk';
    readonly trackerId: string;
    readonly project:   string;
    readonly verdict:   CannotTalkVerdict;
    readonly notice:    VersionsNoticeText;
    readonly pair:      VersionsPairText;
  }
  /** A forge whose board Gaia's relay cannot read: one that reports counts only, sleeps, or lost its repository. */
  | { readonly kind: 'cannot-show'; readonly trackerId: string; readonly project: string }
  | { readonly kind: 'not-registered'; readonly trackerId: string };

/** A refusal shown under the bar: the forge's code and sentence, and the command Try again sends when the bar can send it again as it was. */
export interface BarRefusal extends RefusalText {
  readonly commandLabel: string;
  readonly tryAgain:     ForgeCommandBody | null;
}

export interface ForgeContent {
  /** `null` for a tracker id the fleet document does not hold. */
  readonly bar:  ForgeBar | null;
  readonly area: ForgeArea;
}

const LINE_SEPARATOR = ' · ';

/** The bar's commands that carry nothing but the forge, so Try again can send them as they were; Stop asks its question again instead. */
type KindSentAgainAsItWas = 'forge-pause' | 'forge-unpause' | 'forge-talos-restart';

const SENT_AGAIN_AS_THEY_WERE: ReadonlySet<CommandKind> = new Set<KindSentAgainAsItWas>([
  'forge-pause', 'forge-unpause', 'forge-talos-restart',
]);

/** Pause and Stop for a newer forge, Stop alone beside an older forge's Update forge, as the Versions boards draw them. */
const UNSENT_CONTROLS: Readonly<Record<CannotTalkVerdict, readonly string[]>> = {
  newer: ['Pause', 'Stop'],
  older: ['Stop'],
};

const UPDATE_REFUSAL_LEADS: Readonly<Record<RefusedBy, string>> = {
  forge: 'The forge refused Update: ',
  gaia:  'Gaia could not update the forge: ',
};

const PAUSABLE: ReadonlySet<FleetDocumentCondition> = new Set(['live']);
const RESUMABLE: ReadonlySet<FleetDocumentCondition> = new Set(['paused']);
const STOPPABLE: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'unreachable']);

/** The fidelities at which the forge reported its agents, the last reading of one that stopped answering included. */
const AGENTS_ARE_REPORTED_AT: ReadonlySet<FleetDocumentFidelity> = new Set<FleetDocumentFidelity>(['full', 'counts-only', 'unreachable']);

/** A forge Gaia reads nothing of, dormant, gone or newer than this Gaia, reports no agents: their count is absent, not zero. */
function agentsTextOf(forge: FleetDocumentForge): string | null {
  if (!AGENTS_ARE_REPORTED_AT.has(forge.fidelity)) return null;
  const { concurrency } = forge;
  return concurrency === null
    ? CountTextUtil.countedPhrase(forge.agents.length, 'agent', 'agents')
    : `${concurrency.agentsInFlight} / ${CountTextUtil.countedPhrase(concurrency.limit, 'agent', 'agents')}`;
}

/**
 * The tooltip's usage names only a limit that was hit, without its window; usage under its limit is no news there, nor is the last reading
 * of a forge that stopped answering, which says "as last reported" and since.
 */
function usageTextOf(forge: FleetDocumentForge, clock: ClockReading): string | null {
  const { usage } = forge;
  if (forge.fidelity === 'unreachable' || usage === null || usage.resetsAt === null) return null;
  return `usage limit hit · resets ${StampTextUtil.clockTextAtReadingOf(usage.resetsAt, clock) ?? usage.resetsAt}`;
}

/** After the forge's own count of the agents a network outage stopped, which wait for the outage resume. */
const OUTAGE_ENDINGS_WORDS = ' stopped on an outage';

/** The whole reading for the tooltip: agents, what waits, a usage limit hit and since, after "as last reported" for a forge that stopped answering. */
function statusTextOf(forge: FleetDocumentForge, clock: ClockReading): string {
  const waitingCount = FleetDocumentUtil.waitingCountOf(forge);
  const startedClock = StampTextUtil.clockTextAtReadingOf(forge.hephaestusStartedAt, clock);
  const lastReportedClock = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
  const asLastReported = lastReportedClock === null ? 'as last reported' : `as last reported ${lastReportedClock}`;
  return [
    forge.fidelity === 'unreachable' ? asLastReported : null,
    agentsTextOf(forge),
    waitingCount === null || waitingCount === 0 ? null : CountTextUtil.countedPhrase(waitingCount, 'waits on you', 'wait on you'),
    forge.outageEndings === 0 ? null : `${forge.outageEndings}${OUTAGE_ENDINGS_WORDS}`,
    usageTextOf(forge, clock),
    startedClock === null ? null : `since ${startedClock}`,
  ].filter((part) => part !== null).join(LINE_SEPARATOR);
}

function wordsOf(text: string): BarLineSegment {
  return { text, look: 'words' };
}

function figureOf(text: string): BarLineSegment {
  return { text, look: 'figure' };
}

function agentsLineOf(forge: FleetDocumentForge): readonly BarLineSegment[] | null {
  if (!AGENTS_ARE_REPORTED_AT.has(forge.fidelity)) return null;
  const { concurrency } = forge;
  return concurrency === null
    ? [figureOf(String(forge.agents.length)), wordsOf(forge.agents.length === 1 ? ' agent' : ' agents')]
    : [figureOf(`${concurrency.agentsInFlight} / ${concurrency.limit}`), wordsOf(concurrency.limit === 1 ? ' agent' : ' agents')];
}

/** The line the bar shows: what `statusTextOf` says but usage and since, with the figures apart from the words. */
function statusLineOf(forge: FleetDocumentForge, clock: ClockReading): readonly BarLineSegment[] {
  const waitingCount = FleetDocumentUtil.waitingCountOf(forge);
  const lastReportedClock = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
  const asLastReported = lastReportedClock === null ? [wordsOf('as last reported')] : [wordsOf('as last reported '), figureOf(lastReportedClock)];
  const parts = [
    forge.fidelity === 'unreachable' ? asLastReported : null,
    agentsLineOf(forge),
    waitingCount === null || waitingCount === 0 ? null : [figureOf(String(waitingCount)), wordsOf(waitingCount === 1 ? ' waits on you' : ' wait on you')],
    forge.outageEndings === 0 ? null : [figureOf(String(forge.outageEndings)), wordsOf(OUTAGE_ENDINGS_WORDS)],
  ].filter((part) => part !== null);
  return parts.flatMap((part, i) => (i === 0 ? part : [wordsOf(LINE_SEPARATOR), ...part]));
}

function pauseOrUnpauseOf(forge: FleetDocumentForge): BarCommand | null {
  const { trackerId } = forge;
  if (PAUSABLE.has(forge.condition)) return { label: 'Pause', emphasis: 'quiet', command: { kind: 'forge-pause', trackerId } };
  if (RESUMABLE.has(forge.condition)) return { label: 'Unpause', emphasis: 'primary', command: { kind: 'forge-unpause', trackerId } };
  return null;
}

function stopQuestionOf(forge: FleetDocumentForge): StopQuestion | null {
  return STOPPABLE.has(forge.condition) ? ForgeCommandTextUtil.stopQuestionOf(forge) : null;
}

function withVersionsOf(forge: FleetDocumentForge): ForgeWithVersions | null {
  return forge.versions === null ? null : { project: forge.project, versions: forge.versions };
}

function cannotTalkVerdictOf(forge: FleetDocumentForge): CannotTalkVerdict | null {
  const verdict = forge.versions?.verdict;
  return verdict === 'newer' || verdict === 'older' ? verdict : null;
}

function lineOfVersionsText(versionsText: VersionsText): BarLineSegment[] {
  return versionsText.map((part) => (part.kind === 'version' ? { text: part.text, look: 'version' } : wordsOf(part.text)));
}

/**
 * The condition shown, an older forge's "Needs update" included, and the line: for an ahead forge its agents and the version clause after
 * them, which truncates first; for a forge Gaia cannot talk to the version clause alone. A version clause's whole sentence is the title.
 */
function barStatusOf(forge: FleetDocumentForge, gaiaVersions: GaiaVersions, clock: ClockReading): ForgeBarStatus {
  const shownCondition = ForgeTextUtil.shownConditionOf(forge);
  const forgeWithVersions = withVersionsOf(forge);
  const versionsBar = forgeWithVersions === null ? null : ForgeVersionsTextUtil.barTextOf(forgeWithVersions, gaiaVersions);
  const statusLine = statusLineOf(forge, clock);
  const versionsLine = versionsBar === null ? [] : lineOfVersionsText(versionsBar.line);
  return {
    condition: ForgeTextUtil.dotConditionOf(shownCondition),
    word:      ForgeTextUtil.conditionWordInSentenceCaseOf(shownCondition),
    line:      statusLine.length === 0 || versionsLine.length === 0 ? [...statusLine, ...versionsLine] : [...statusLine, wordsOf(LINE_SEPARATOR), ...versionsLine],
    text:      versionsBar?.title ?? statusTextOf(forge, clock),
  };
}

function barCannotTalkOf(forge: FleetDocumentForge, gaiaVersions: GaiaVersions): BarCannotTalk | null {
  const verdict = cannotTalkVerdictOf(forge);
  const forgeWithVersions = withVersionsOf(forge);
  if (verdict === null || forgeWithVersions === null) return null;
  return {
    verdict,
    unsentControls:     UNSENT_CONTROLS[verdict],
    unsentControlTitle: ForgeVersionsTextUtil.unsentControlTitleOf(forgeWithVersions, gaiaVersions) ?? '',
  };
}

const NEWER_INSTALLED_WORDS = ' · newer installed ';

const LIVE_CONDITION = 'live';

function hephaestusPairOf(runningVersions: FleetDocumentRunningVersions): BarVersionPair {
  const { hephaestusRunning, hephaestusNewest } = runningVersions;
  const newerIsInstalled = FleetDocumentUtil.newerHephaestusCodeIsInstalled(runningVersions);
  return {
    component: 'Hephaestus',
    line:      [
      wordsOf('Hephaestus '),
      figureOf(hephaestusRunning),
      ...(newerIsInstalled && hephaestusNewest !== null ? [wordsOf(NEWER_INSTALLED_WORDS), figureOf(hephaestusNewest)] : []),
    ],
    newerIsInstalled,
    title: newerIsInstalled
      ? `Hephaestus runs code ${hephaestusRunning}; code ${hephaestusNewest} is installed. Restart Hephaestus to run it.`
      : `Hephaestus runs code ${hephaestusRunning}${hephaestusNewest === null ? '' : ', the code installed'}.`,
  };
}

/**
 * Talos starts from the forge program's code, so it runs the newest when its protocol is the installed program's and its code version is
 * the installed code's; while the installed program is not read, nothing marks it.
 */
function talosIsBehindTheInstalledProgram({ talosRunning, talosNewest, hephaestusNewest }: FleetDocumentRunningVersions): boolean {
  if (talosRunning === null || talosNewest === null) return false;
  return talosRunning.protocolVersion !== talosNewest || (hephaestusNewest !== null && talosRunning.codeVersion !== hephaestusNewest);
}

function talosPairOf(versions: FleetDocumentRunningVersions): BarVersionPair {
  const { talosRunning, talosNewest, hephaestusNewest } = versions;
  if (talosRunning === null) {
    return {
      component: 'Talos', line: [wordsOf('Talos not running')], newerIsInstalled: false, title: 'No Talos runs for this forge.'
    };
  }
  const newerIsInstalled = talosIsBehindTheInstalledProgram(versions);
  const running = `protocol ${talosRunning.protocolVersion}`;
  const newest = talosNewest === null ? null : `protocol ${talosNewest}`;
  return {
    component: 'Talos',
    line:      [
      wordsOf('Talos '),
      figureOf(running),
      wordsOf(' · '),
      figureOf(talosRunning.codeVersion),
      ...(newerIsInstalled && newest !== null ? [wordsOf(NEWER_INSTALLED_WORDS), figureOf(newest)] : []),
    ],
    newerIsInstalled,
    title: newerIsInstalled
      ? `Talos runs ${running}, code ${talosRunning.codeVersion}; the installed program starts ${newest ?? running}, code ${hephaestusNewest ?? talosRunning.codeVersion}. `
        + 'Restart Talos to run it.'
      : `Talos runs ${running}, code ${talosRunning.codeVersion}.`,
  };
}

function barVersionsOf(forge: FleetDocumentForge): BarVersions {
  const { trackerId, runningVersions } = forge;
  return {
    pairs:             runningVersions === null ? [] : [hephaestusPairOf(runningVersions), talosPairOf(runningVersions)],
    restartHephaestus: { label: 'Restart Hephaestus', emphasis: 'quiet', command: { kind: 'forge-restart', trackerId } },
    restartTalos:      { label: 'Restart Talos', emphasis: 'quiet', command: { kind: 'forge-talos-restart', trackerId } },
    restartsMayAct:    runningVersions !== null && ForgeContractUtil.controlContractIsKnown(forge),
  };
}

function barOf(forge: FleetDocumentForge, gaiaVersions: GaiaVersions, homeFolder: string, clock: ClockReading): ForgeBar {
  const cannotTalk = barCannotTalkOf(forge, gaiaVersions);
  const talks = cannotTalk === null;
  return {
    trackerId:              forge.trackerId,
    project:                forge.project,
    root:                   PathTextUtil.homeRelativePathOf(forge.root, homeFolder),
    conditionIsLive:        ForgeTextUtil.shownConditionOf(forge) === LIVE_CONDITION,
    status:                 barStatusOf(forge, gaiaVersions, clock),
    pauseOrUnpause:         talks ? pauseOrUnpauseOf(forge) : null,
    stop:                   talks ? stopQuestionOf(forge) : null,
    controlContractIsKnown: ForgeContractUtil.controlContractIsKnown(forge),
    cannotTalk,
    versions:               talks ? barVersionsOf(forge) : null,
  };
}

/** The step Update forge is at, from the forge's command state: on its way, done with its restart pending, or refused. */
function updateStepOf(commandState: CommandState): BarUpdateStep {
  if (commandState.onItsWay === 'forge-update') return { step: 'pending' };
  const { failure } = commandState;
  if (failure !== null && failure.kind === 'forge-update') {
    const { refusedBy, code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
    const lead = UPDATE_REFUSAL_LEADS[refusedBy];
    return {
      step: 'refused', lead, code, sentence, wholeSentence: `${lead}${code}. ${sentence}`,
    };
  }
  return commandState.restartPending ? { step: 'done' } : { step: 'idle' };
}

function areaOf(trackerId: string, forge: FleetDocumentForge | undefined, gaiaVersions: GaiaVersions): ForgeArea {
  if (forge === undefined) return { kind: 'not-registered', trackerId };
  const { project } = forge;
  const verdict = cannotTalkVerdictOf(forge);
  const forgeWithVersions = withVersionsOf(forge);
  const notice = forgeWithVersions === null ? null : ForgeVersionsTextUtil.noticeTextOf(forgeWithVersions, gaiaVersions);
  if (verdict !== null && forgeWithVersions !== null && notice !== null) return {
    kind: 'cannot-talk', trackerId, project, verdict, notice, pair: ForgeVersionsTextUtil.pairTextOf(forgeWithVersions, gaiaVersions),
  };
  if (ForgeContractUtil.canOpenInPlace(forge)) return { kind: 'board', trackerId, project };
  return { kind: 'cannot-show', trackerId, project };
}

function forgeContentOf(trackerId: string, fleetDocument: FleetDocument, clock: ClockReading): ForgeContent {
  const forge = fleetDocument.forges.find((candidate) => candidate.trackerId === trackerId);
  const gaiaVersions = fleetDocument.gaia.versions;
  const bar = forge === undefined ? null : barOf(forge, gaiaVersions, fleetDocument.gaia.homeFolder, clock);
  return { bar, area: areaOf(trackerId, forge, gaiaVersions) };
}

function kindIsSentAgainAsItWas(kind: CommandKind): kind is KindSentAgainAsItWas {
  return SENT_AGAIN_AS_THEY_WERE.has(kind);
}

/** A refused Update forge of an older forge shows in the bar, beside where Update forge was, not under it as well. */
function barRefusalOf(trackerId: string, failure: CommandFailure | null, updateIsInTheBar = false): BarRefusal | null {
  const commandLabel = failure === null ? null : ForgeCommandTextUtil.commandLabelOf(failure.kind);
  if (failure === null || commandLabel === null) return null;
  if (updateIsInTheBar && failure.kind === 'forge-update') return null;
  const { kind } = failure;
  return {
    commandLabel,
    ...CommandFailureTextUtil.refusalTextOf(failure),
    tryAgain: kindIsSentAgainAsItWas(kind) ? { kind, trackerId } : null,
  };
}

export const ForgeModel = {
  forgeContentOf,
  barRefusalOf,
  updateStepOf,
} as const;
