/**
 * What the Forges view shows of a fleet document (SCREENS A4 and B2): the status line, one row per forge with the buttons of its condition,
 * the Stop dialog under the row it stops, a held forge's banner, the forges whose repository is gone, the forges hidden in Gaia, and this
 * machine's agent limit. The command states decide which controls wait for a command on its way and where a refusal or a restart an update
 * left pending shows; the page's clock only prints clock times. A value the document does not hold is absent, never zero. A forge at
 * another version than this Gaia is built for opens its versions under its row; one Gaia cannot talk to shows nothing of its work.
 */

import type {
  CommandBody,
  CommandKind,
  ForgeCommandBody,
  ForgeStopAgents,
} from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentCondition,
  FleetDocumentForge,
  FleetDocumentForgeVersions,
} from '../../@types/FleetDocument.ts';
import { CommandSender, type CommandStates }                           from '../../api/CommandSender.ts';
import type { DotCondition }                                           from '../../components/ConditionDot.tsx';
import type { ButtonEmphasis }                                         from '../../lib/design-system/DesignSystemInterface.ts';
import type { ClockReading }                                           from '../../shared/@types/ClockReading.ts';
import type { PageFigure }                                             from '../../shared/@types/ViewParts.ts';
import { HashRouter }                                                  from '../../shared/HashRouter.ts';
import { AddRepositoryForm }                                           from '../../shared/add-repository/AddRepositoryForm.ts';
import { CommandFailureTextUtil, type RefusalText }                    from '../../shared/utils/CommandFailureTextUtil.ts';
import { CountTextUtil }                                               from '../../shared/utils/CountTextUtil.ts';
import { FleetDocumentUtil }                                           from '../../shared/utils/FleetDocumentUtil.ts';
import { ForgeCommandTextUtil, type StopChoice as StopQuestionChoice } from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }                                           from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil, type ShownCondition }                          from '../../shared/utils/ForgeTextUtil.ts';
import {
  type ForgeWithVersions,
  ForgeVersionsTextUtil,
  type GaiaVersions,
  type VersionsPairText,
  type VersionsSublineText,
} from '../../shared/utils/ForgeVersionsTextUtil.ts';
import { PathTextUtil }  from '../../shared/utils/PathTextUtil.ts';
import { StampTextUtil } from '../../shared/utils/StampTextUtil.ts';
import { AGENT_LIMITS }  from './constants/AgentLimits.ts';

/** The Stop dialog open under one row, and the choice it holds. */
export interface StopDialogState {
  readonly trackerId: string;
  readonly agents:    ForgeStopAgents;
}

export interface ForgesSurroundings {
  readonly clock:            ClockReading;
  readonly commandStates:    CommandStates;
  readonly stopDialog:       StopDialogState | null;
  /** The row the route names, shown selected and scrolled into view. */
  readonly forgeInView:      string | null;
  /** The last command this view sent to each forge, so "Try again" sends the same limit or the same Stop again. */
  readonly lastSent:         ReadonlyMap<string, ForgeCommandBody>;
  /** The row whose versions disclosure is open; one at a time. */
  readonly versionsShownFor: string | null;
}

/** The buttons a row may show, by its condition. */
export type RowButtonKind = 'pause' | 'unpause' | 'stop' | 'start' | 'open' | 'look-again' | 'hide';

export type ForgeButtonKind = RowButtonKind | 'update' | 'restart' | 'show-again';

/** A row's button: a command Gaia sends, the Stop that opens its dialog, or a place the page goes. */
export type ForgeButton =
  | {
    readonly kind:     'command';
    readonly button:   ForgeButtonKind;
    readonly label:    string;
    readonly emphasis: ButtonEmphasis;
    readonly command:  CommandBody;
    readonly disabled: boolean;
    /** Why a control Gaia cannot send is off, naming both versions. */
    readonly title?:   string;
  }
  | { readonly kind: 'stop'; readonly button: 'stop'; readonly label: string; readonly disabled: boolean; readonly title?: string }
  | { readonly kind: 'link'; readonly button: 'open'; readonly label: string; readonly href: string; readonly disabled: boolean }
  /** B2: Gaia's own `forge start` is on its way, and its one button says so. */
  | { readonly kind: 'waiting'; readonly label: string };

export type ForgeAgentsCell =
  | {
    readonly kind:         'stepper';
    /** The agents running now, shown before the limit the stepper changes. */
    readonly inFlight:     number;
    readonly limit:        number;
    readonly lowerLabel:   string;
    readonly raiseLabel:   string;
    /** `null` at the lowest limit or at the forge's ceiling: that side is off. */
    readonly lowerCommand: ForgeCommandBody | null;
    readonly raiseCommand: ForgeCommandBody | null;
    readonly disabled:     boolean;
  }
  | { readonly kind: 'text'; readonly text: string }
  /** A forge Gaia cannot talk to: nothing of its work is read. */
  | { readonly kind: 'not-read' };

export type ConditionTone = 'warn' | 'muted';

/** A detail that is a machine value, a clock time or a path, is set in mono; one that is words, in the interface face. */
export type DetailFace = 'mono' | 'ui';

export interface ShownRefusal extends RefusalText {
  readonly commandLabel: string;
  /** `null` when this view cannot tell what was sent, such as a limit another view set. */
  readonly retryCommand: CommandBody | null;
}

/** An update was done and the forge runs the old code until it restarts, beside the control that sent the update. */
export interface PendingRestart {
  readonly word:          string;
  readonly sentence:      string;
  readonly restartButton: ForgeButton;
  readonly dismissLabel:  string;
}

export interface StopChoice extends StopQuestionChoice {
  readonly chosen: boolean;
}

export interface StopDialog {
  readonly label:       string;
  readonly question:    string;
  /** Empty when no agent runs: then there is nothing to choose. */
  readonly choices:     readonly StopChoice[];
  readonly consequence: string | null;
  readonly command:     ForgeCommandBody;
  readonly isOnItsWay:  boolean;
}

/**
 * A forge's versions on its row: the subline under its condition, which for any verdict but current opens the versions pair under the row
 * with its sentence, and an ahead forge's quiet line, hidden while the pair, which says the same, is open.
 */
export interface ForgeRowVersions {
  /** `null` where the condition's own detail says more than a current version, such as a paused forge's. */
  readonly subline:         VersionsSublineText | null;
  readonly disclosureLabel: string;
  readonly isShown:         boolean;
  /** `null` while the pair is closed. */
  readonly pair:            VersionsPairText | null;
  readonly pairSentence:    string | null;
  readonly quietLine:       string | null;
}

export interface ForgeRow {
  readonly trackerId:      string;
  readonly project:        string;
  readonly rootText:       string;
  /** The root in full, for a window too narrow to print `rootText` whole. */
  readonly rootPath:       string;
  readonly condition:      DotCondition;
  readonly conditionWord:  string;
  readonly conditionTone:  ConditionTone | null;
  readonly detailText:     string | null;
  readonly detailFace:     DetailFace;
  readonly agents:         ForgeAgentsCell | null;
  /** What waits on User in this forge, counted for its badge; `null` where nothing waits or the count is not known. */
  readonly waitingCount:   number | null;
  /** `false` for a forge Gaia cannot talk to: its agents and what waits in it are not read. */
  readonly workIsRead:     boolean;
  readonly codeText:       string | null;
  readonly buttons:        readonly ForgeButton[];
  readonly isInView:       boolean;
  readonly stopDialog:     StopDialog | null;
  readonly refusal:        ShownRefusal | null;
  readonly pendingRestart: PendingRestart | null;
  /** The forge's notice that its Assistant cannot come up, as the server worded it in Gaia's words. */
  readonly noticeText:     string | null;
  /** Its own count of the agents a network outage stopped, which wait for the outage resume; `null` with none. */
  readonly outageText:     string | null;
  /** `null` for a forge read without its versions. */
  readonly versions:       ForgeRowVersions | null;
  /** While an Update forge Gaia sent this forge is on its way, said under the row. */
  readonly updateStatus:   string | null;
}

export interface HeldBanner {
  readonly trackerId:      string;
  readonly project:        string;
  readonly sentence:       string;
  readonly updateButton:   ForgeButton;
  readonly refusal:        ShownRefusal | null;
  readonly pendingRestart: PendingRestart | null;
}

/** A forge outside the table: its repository is gone, or User hid it in Gaia. */
export interface ForgeEntry {
  readonly trackerId:  string;
  readonly project:    string;
  readonly condition:  DotCondition;
  /** The word in the pill beside the name, such as "Missing"; `null` where the detail line already names the condition. */
  readonly pillWord:   string | null;
  readonly detailText: string;
  readonly button:     ForgeButton;
  readonly isInView:   boolean;
  readonly refusal:    ShownRefusal | null;
}

export interface MachineFact {
  readonly label:      string;
  readonly value:      string;
  /** Set only on the fact that stands at the machine's limit: the ready tickets that wait for a slot. */
  readonly attention?: true;
}

export interface MachinePanel {
  readonly limitText:      string;
  /** `null` while no forge reports a machine limit. */
  readonly limit:          number | null;
  readonly lowerCommand:   CommandBody | null;
  readonly raiseCommand:   CommandBody | null;
  /** Off when no forge enforces a limit, and while a limit is on its way. */
  readonly stepperIsOff:   boolean;
  readonly sentence:       string;
  /** `usedText` is the figure as printed: `8+` while a forge is not counted. */
  readonly meter:          { readonly used: number; readonly usedText: string; readonly whole: number; readonly label: string } | null;
  readonly isAtTheLimit:   boolean;
  readonly atTheLimitText: string | null;
  readonly facts:          readonly MachineFact[];
  /** The forges whose agents this Gaia cannot read, so the figure leaves them out; `null` while every forge is counted. */
  readonly notCountedText: string | null;
}

export interface ForgesContent {
  readonly rows:          readonly ForgeRow[];
  /** What the table's place says when it holds no row. */
  readonly emptySentence: string | null;
  /** B2: the line under the table that says why a control is off or a refusal shows, while one is; `null` at rest. */
  readonly controlsNote:  string | null;
  readonly heldBanners:   readonly HeldBanner[];
  readonly notFoundHead:  string;
  readonly notFound:      readonly ForgeEntry[];
  readonly hiddenHead:    string;
  readonly hidden:        readonly ForgeEntry[];
  readonly machine:       MachinePanel;
  /** What the verdicts mean, under the table while a row opens its versions. */
  readonly versionsNote:  string | null;
}

const HEAD_SEPARATOR = ' · ';
const DETAIL_SEPARATOR = ' · ';
const SHORT_CODE_VERSION_CHARACTERS = 7;

/** What the machine panel's limit shows while no forge reports one. */
const NO_LIMIT_KNOWN = '—';

/** The conditions under which a forge's Hephaestus runs. */
const RUNNING_CONDITIONS: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'restarting']);

/** The fidelities at which the forge's Hephaestus answered its last read, so a command it carries reaches it. */
const HEPHAESTUS_ANSWERS_AT: ReadonlySet<FleetDocumentForge['fidelity']> = new Set(['full', 'counts-only', 'newer-contract']);

/** SCREENS A4: which buttons each condition shows. Open is left out where the forge cannot open in place (F5). */
const BUTTONS_BY_CONDITION: Readonly<Record<FleetDocumentCondition, readonly RowButtonKind[]>> = {
  'live':        ['pause', 'stop', 'open'],
  'paused':      ['unpause', 'stop', 'open'],
  'held':        ['stop', 'open'],
  'restarting':  [],
  'starting':    [],
  'dormant':     ['start'],
  'unreachable': ['look-again', 'stop'],
  'unreadable':  [],
  'missing':     ['hide'],
};

const NOTICE_KIND_OF_HELD_LAUNCHES = 'install-version-changed';

const NOTICE_KIND_OF_ASSISTANT_DOWN = 'assistant-down';

const HELD_SENTENCE_WITHOUT_NOTICE = 'Its install version changed. Nothing launches until this forge is updated.';

function hiddenTrackerIdsOf(fleetDocument: FleetDocument): ReadonlySet<string> {
  return new Set(fleetDocument.settings.hiddenTrackerIds);
}

function onItsWayFor(commandStates: CommandStates, trackerId: string): CommandKind | null {
  return CommandSender.stateOf(commandStates, { trackerId }).onItsWay;
}

/** Gaia's own `forge start` on its way shows a dormant forge as starting until the document reports what came of it. */
function shownConditionOf(forge: FleetDocumentForge, commandStates: CommandStates): ShownCondition {
  return forge.condition === 'dormant' && onItsWayFor(commandStates, forge.trackerId) === 'forge-start' ? 'starting' : ForgeTextUtil.shownConditionOf(forge);
}

/** A forge whose versions say Gaia cannot talk to it: Gaia shows that it runs and nothing of its work, and sends it no command. */
function cannotTalkTo(forge: FleetDocumentForge): forge is FleetDocumentForge & { readonly versions: FleetDocumentForgeVersions } {
  return forge.versions?.verdict === 'older' || forge.versions?.verdict === 'newer';
}

function withVersionsOf(forge: FleetDocumentForge): ForgeWithVersions | null {
  return forge.versions === null ? null : { project: forge.project, versions: forge.versions };
}

/**
 * The page title's figures: every registered forge, hidden ones too, how many run, how many start or are hidden when any are, and how many
 * this Gaia cannot read; a forge Gaia cannot talk to answered its versions, so it runs.
 */
function titleFiguresOf(fleetDocument: FleetDocument): PageFigure[] {
  const { forges } = fleetDocument;
  const running = forges.filter((forge) => RUNNING_CONDITIONS.has(forge.condition) || cannotTalkTo(forge)).length;
  const starting = forges.filter((forge) => forge.condition === 'starting').length;
  const hiddenTrackerIds = hiddenTrackerIdsOf(fleetDocument);
  const hidden = forges.filter((forge) => hiddenTrackerIds.has(forge.trackerId)).length;
  const notRead = forges.filter(cannotTalkTo).length;
  return [
    { value: String(forges.length), label: 'registered' },
    { value: String(running), label: 'running' },
    ...(starting === 0 ? [] : [{ value: String(starting), label: 'starting', attention: true }]),
    ...(hidden === 0 ? [] : [{ value: String(hidden), label: 'hidden' }]),
    ...(notRead === 0 ? [] : [{ value: String(notRead), label: 'not read' }]),
  ];
}

function apiCarriesCommandsTo(forge: FleetDocumentForge): boolean {
  return HEPHAESTUS_ANSWERS_AT.has(forge.fidelity) && ForgeContractUtil.controlContractIsKnown(forge);
}

/** A Stop reaches an answering Hephaestus only in the control contract Gaia knows; with none answering, the forge program stops the forge. */
function stopReaches(forge: FleetDocumentForge): boolean {
  return !HEPHAESTUS_ANSWERS_AT.has(forge.fidelity) || ForgeContractUtil.controlContractIsKnown(forge);
}

interface RowSurroundings {
  readonly fleetDocument:         FleetDocument;
  readonly surroundings:          ForgesSurroundings;
  readonly gaiaHasNoForgeProgram: boolean;
}

/** Gaia starts a forge with the program its registry entry names, else the one in its settings, as the server does. */
function forgeProgramIsMissingFor(forge: FleetDocumentForge, { gaiaHasNoForgeProgram }: RowSurroundings): boolean {
  return forge.program === null && gaiaHasNoForgeProgram;
}

/** The Stop dialog stays only under a row that still offers a Stop that reaches its forge; a forge stopped meanwhile drops it. */
function stopDialogIsOpenOn(forge: FleetDocumentForge, stopDialog: StopDialogState | null): boolean {
  return stopDialog?.trackerId === forge.trackerId && rowButtonKindsOf(forge).includes('stop') && stopReaches(forge);
}

function forgeIsBusy(forge: FleetDocumentForge, { surroundings }: RowSurroundings): boolean {
  return onItsWayFor(surroundings.commandStates, forge.trackerId) !== null || stopDialogIsOpenOn(forge, surroundings.stopDialog);
}

function commandButton(button: ForgeButtonKind, label: string, command: CommandBody, disabled: boolean, emphasis: ButtonEmphasis = 'quiet'): ForgeButton {
  return {
    kind: 'command',
    button,
    label,
    emphasis,
    command,
    disabled,
  };
}

function buttonOf(button: RowButtonKind, forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeButton | null {
  const { trackerId } = forge;
  const isBusy = forgeIsBusy(forge, rowSurroundings);
  switch (button) {
    case 'pause':
      return commandButton(button, 'Pause', { kind: 'forge-pause', trackerId }, isBusy || !apiCarriesCommandsTo(forge));
    case 'unpause':
      return commandButton(button, 'Unpause', { kind: 'forge-unpause', trackerId }, isBusy || !apiCarriesCommandsTo(forge), 'primary');
    case 'stop':
      return {
        kind: 'stop', button, label: 'Stop', disabled: isBusy || !stopReaches(forge)
      };
    case 'start':
      return commandButton(button, 'Start', { kind: 'forge-start', trackerId }, isBusy || forgeProgramIsMissingFor(forge, rowSurroundings), 'primary');
    case 'open':
      if (!ForgeContractUtil.canOpenInPlace(forge)) return null;
      return {
        kind:     'link',
        button,
        label:    'Open',
        href:     HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute: null }),
        disabled: isBusy,
      };
    case 'look-again': {
      const lookAgainIsOnItsWay = CommandSender.stateOf(rowSurroundings.surroundings.commandStates, { fleetCommand: 'fleet-look-again' }).onItsWay !== null;
      return commandButton(button, 'Look again', { kind: 'fleet-look-again' }, lookAgainIsOnItsWay);
    }
    case 'hide':
      return commandButton(button, 'Hide in Gaia', { kind: 'forge-hide', trackerId }, isBusy);
  }
}

function withTitle(button: ForgeButton, title: string): ForgeButton {
  return button.kind === 'command' || button.kind === 'stop' ? { ...button, title } : button;
}

/** Update forge is the row's one primary, until a restart it left pending takes that place; it says so while it is on its way. */
function updateButtonOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeButton {
  const { trackerId } = forge;
  const command: CommandBody = { kind: 'forge-update', trackerId };
  const { commandStates } = rowSurroundings.surroundings;
  if (onItsWayFor(commandStates, trackerId) === 'forge-update') return commandButton('update', ForgeVersionsTextUtil.UPDATE_FORGE_TEXT.pendingButton, command, true, 'primary');
  const restartIsPending = CommandSender.stateOf(commandStates, { trackerId }).restartPending;
  return commandButton('update', 'Update forge', command, forgeIsBusy(forge, rowSurroundings), restartIsPending ? 'quiet' : 'primary');
}

/** An older forge offers Update forge; a newer one only what it would offer, off. Neither opens in place. */
function buttonsOfAForgeGaiaCannotTalkTo(forge: FleetDocumentForge & { readonly versions: FleetDocumentForgeVersions }, rowSurroundings: RowSurroundings): ForgeButton[] {
  const title = ForgeVersionsTextUtil.unsentControlTitleOf(forge, rowSurroundings.fleetDocument.gaia.versions) ?? '';
  const stop = withTitle({
    kind: 'stop', button: 'stop', label: 'Stop', disabled: true
  }, title);
  if (forge.versions.verdict === 'older') return [updateButtonOf(forge, rowSurroundings), stop];
  return [withTitle(commandButton('pause', 'Pause', { kind: 'forge-pause', trackerId: forge.trackerId }, true), title), stop];
}

/**
 * A forge that crashed or is down offers its start, as one that never answered would. A down forge keeps the Stop of an unreachable one,
 * since its Hephaestus may be alive but not answering; a crashed one's Hephaestus is gone.
 */
const BUTTONS_BY_PRESENCE_OFF: Readonly<Partial<Record<FleetDocumentForge['presence']['state'], readonly RowButtonKind[]>>> = {
  crashed: ['start', 'look-again'],
  down:    ['start', 'look-again', 'stop'],
};

function rowButtonKindsOf(forge: FleetDocumentForge): readonly RowButtonKind[] {
  return BUTTONS_BY_PRESENCE_OFF[forge.presence.state] ?? BUTTONS_BY_CONDITION[forge.condition];
}

function buttonsOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeButton[] {
  if (shownConditionOf(forge, rowSurroundings.surroundings.commandStates) === 'starting') return [{ kind: 'waiting', label: 'Starting' }];
  if (cannotTalkTo(forge)) return buttonsOfAForgeGaiaCannotTalkTo(forge, rowSurroundings);
  return rowButtonKindsOf(forge).flatMap((button) => {
    const shown = buttonOf(button, forge, rowSurroundings);
    return shown === null ? [] : [shown];
  });
}

function agentsInFlightOf(forge: FleetDocumentForge): number {
  return forge.concurrency?.agentsInFlight ?? forge.agents.length;
}

function detailTextOf(forge: FleetDocumentForge, shownCondition: ShownCondition, rowSurroundings: RowSurroundings): string | null {
  const { clock } = rowSurroundings.surroundings;
  switch (shownCondition) {
    case 'live':
    case 'held':
    case 'restarting': {
      const startedClock = StampTextUtil.clockTextAtReadingOf(forge.hephaestusStartedAt, clock);
      return startedClock === null ? null : `since ${startedClock}`;
    }
    case 'paused': {
      const finishing = agentsInFlightOf(forge);
      const finishingPhrase = finishing === 0 ? null : CountTextUtil.countedPhrase(finishing, 'agent finishing', 'agents finishing');
      return [finishingPhrase, 'starts no new job'].filter((part) => part !== null).join(DETAIL_SEPARATOR);
    }
    case 'starting':
      return `forge start${DETAIL_SEPARATOR}waiting for its API`;
    case 'dormant': {
      if (forgeProgramIsMissingFor(forge, rowSurroundings)) return 'the forge program was not found';
      const stoppedClock = StampTextUtil.clockTextAtReadingOf(forge.lastChangedAt, clock);
      return stoppedClock === null ? null : `stopped ${stoppedClock}`;
    }
    case 'unreachable': {
      const lastReported = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
      return lastReported === null ? 'stopped answering' : `as last reported ${lastReported}`;
    }
    case 'unreadable':
      return 'newer than this Gaia';
    case 'missing':
      return 'the repository folder is gone';
    case 'outdated':
      return 'older than this Gaia';
    case 'crashed': {
      const { crashSummary } = forge;
      const crashWords = crashSummary?.suspected === true ? 'suspected crash before a reboot' : 'stays off until started';
      return [crashWords, crashSummary?.errorName ?? null].filter((part) => part !== null).join(DETAIL_SEPARATOR);
    }
    case 'down': {
      const lastReported = StampTextUtil.clockTextAtReadingOf(forge.lastReportedAt, clock);
      return lastReported === null ? 'gone or hung' : `gone or hung${DETAIL_SEPARATOR}last reported ${lastReported}`;
    }
    case 'hung':
      return 'its agents wait for a resume';
  }
}

/** B2: held, starting and a forge that needs an update read in orange; a paused, dormant, unreadable or missing forge in the secondary ink. */
function conditionToneOf(condition: ShownCondition): ConditionTone | null {
  if (condition === 'held' || condition === 'starting' || condition === 'outdated') return 'warn';
  if (condition === 'paused' || condition === 'dormant' || condition === 'unreadable' || condition === 'missing') return 'muted';
  return null;
}

function detailFaceOf(condition: ShownCondition, forgeProgramIsMissing: boolean): DetailFace {
  if (condition === 'paused' || condition === 'starting' || condition === 'unreadable' || condition === 'missing' || condition === 'outdated') return 'ui';
  return condition === 'dormant' && forgeProgramIsMissing ? 'ui' : 'mono';
}

/**
 * The forge's own limit, between one agent and the forge's ceiling; a stepper only while its Hephaestus runs and is read in full, and a
 * disabled one while the forge starts (B2).
 */
function agentsCellOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeAgentsCell | null {
  if (cannotTalkTo(forge)) return { kind: 'not-read' };
  const { concurrency, trackerId, project } = forge;
  if (concurrency === null) return null;
  const valueText = `${concurrency.agentsInFlight} / ${concurrency.limit}`;
  const isStarting = shownConditionOf(forge, rowSurroundings.surroundings.commandStates) === 'starting';
  const hephaestusRuns = RUNNING_CONDITIONS.has(forge.condition) && forge.fidelity === 'full';
  if (!hephaestusRuns && !isStarting) return { kind: 'text', text: valueText };
  const { limit } = concurrency;
  return {
    kind:         'stepper',
    inFlight:     concurrency.agentsInFlight,
    limit,
    lowerLabel:   `Lower ${project}'s agent limit`,
    raiseLabel:   `Raise ${project}'s agent limit`,
    lowerCommand: limit <= AGENT_LIMITS.lowestAgents ? null : { kind: 'forge-concurrency-set', trackerId, limit: limit - 1 },
    raiseCommand: limit >= AGENT_LIMITS.forgeCeilingAgents ? null : { kind: 'forge-concurrency-set', trackerId, limit: limit + 1 },
    disabled:     isStarting || forgeIsBusy(forge, rowSurroundings) || !apiCarriesCommandsTo(forge),
  };
}

/** A row shows no count for nothing waiting, as for no count reported. */
function waitingCountShownOf(forge: FleetDocumentForge): number | null {
  const count = FleetDocumentUtil.waitingCountOf(forge);
  return count === 0 ? null : count;
}

/** A command that names only its forge can be sent again from its kind alone; any other only as this view last sent it. */
function retryCommandOf(kind: CommandKind, trackerId: string, lastSent: ForgeCommandBody | undefined): CommandBody | null {
  if (lastSent?.kind === kind) return lastSent;
  switch (kind) {
    case 'forge-start':
    case 'forge-pause':
    case 'forge-unpause':
    case 'forge-restart':
    case 'forge-update':
    case 'forge-hide':
    case 'forge-unhide':
      return { kind, trackerId };
    default:
      return null;
  }
}

/** The forge's refusal, shown where `showsHere` says the refused kind belongs, until dismissed or until the next command to it succeeds. */
function refusalOf(trackerId: string, surroundings: ForgesSurroundings, showsHere: (kind: CommandKind) => boolean): ShownRefusal | null {
  const { failure } = CommandSender.stateOf(surroundings.commandStates, { trackerId });
  const commandLabel = failure === null ? null : ForgeCommandTextUtil.commandLabelOf(failure.kind);
  if (failure === null || commandLabel === null || !showsHere(failure.kind)) return null;
  return {
    commandLabel,
    ...CommandFailureTextUtil.refusalTextOf(failure),
    retryCommand: retryCommandOf(failure.kind, trackerId, surroundings.lastSent.get(trackerId)),
  };
}

/**
 * B2: the dialog under the row it stops. With no agent running there is nothing to choose, nor for a Hephaestus that does not answer Gaia,
 * since the forge program then stops it whatever its agents were asked to do; the agents are then kept.
 */
function stopDialogOf(forge: FleetDocumentForge, surroundings: ForgesSurroundings): StopDialog | null {
  const { stopDialog } = surroundings;
  if (stopDialog === null || !stopDialogIsOpenOn(forge, stopDialog)) return null;
  const {
    label, question, choices: offered, consequence
  } = ForgeCommandTextUtil.stopQuestionOf(forge);
  const choices = apiCarriesCommandsTo(forge) ? offered.map((choice) => ({ ...choice, chosen: choice.agents === stopDialog.agents })) : [];
  return {
    label,
    question,
    choices,
    consequence,
    command:    { kind: 'forge-stop', trackerId: forge.trackerId, agents: choices.length === 0 ? 'keep' : stopDialog.agents },
    isOnItsWay: onItsWayFor(surroundings.commandStates, forge.trackerId) === 'forge-stop',
  };
}

const SENT_FROM_THE_HELD_BANNER: ReadonlySet<CommandKind> = new Set<CommandKind>(['forge-update', 'forge-restart']);

/** A held forge's Update forge, and the Restart its update may leave pending, sit on its banner, so their refusals show there. */
function refusalBelongsToTheHeldBanner(forge: FleetDocumentForge, kind: CommandKind): boolean {
  return forge.condition === 'held' && SENT_FROM_THE_HELD_BANNER.has(kind);
}

/**
 * The restart an update left pending, until a restart, stop or update of the forge succeeds or it is dismissed; Restart needs its API. Under
 * the row of a forge Gaia cannot talk to it says Gaia reads the forge once it restarts.
 */
function pendingRestartOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): PendingRestart | null {
  const { trackerId } = forge;
  if (!CommandSender.stateOf(rowSurroundings.surroundings.commandStates, { trackerId }).restartPending) return null;
  const { word, restartLabel, dismissLabel } = ForgeCommandTextUtil.RESTART_PENDING;
  const sentence = cannotTalkTo(forge) ? ForgeVersionsTextUtil.UPDATE_FORGE_TEXT.doneUnderAControl : ForgeCommandTextUtil.RESTART_PENDING.sentence;
  const restartIsOff = forgeIsBusy(forge, rowSurroundings) || !apiCarriesCommandsTo(forge);
  return {
    word,
    sentence,
    restartButton: commandButton('restart', restartLabel, { kind: 'forge-restart', trackerId }, restartIsOff, 'primary'),
    dismissLabel,
  };
}

/** The conditions whose detail is only when Hephaestus started: the versions subline takes their place. */
const CONDITIONS_DETAILED_BY_THEIR_START: ReadonlySet<ShownCondition> = new Set(['live', 'held', 'restarting']);

const VERSIONS_DISCLOSURE_LABEL_SUFFIX = ', its version beside this Gaia’s';

/** A current forge's version replaces when its Hephaestus started; any other verdict's disclosure replaces whatever the detail was. */
function rowVersionsOf(forge: FleetDocumentForge, shownCondition: ShownCondition, { fleetDocument, surroundings }: RowSurroundings): ForgeRowVersions | null {
  const withVersions = withVersionsOf(forge);
  if (withVersions === null) return null;
  const gaiaVersions: GaiaVersions = fleetDocument.gaia.versions;
  const subline = ForgeVersionsTextUtil.sublineTextOf(withVersions);
  const isShown = subline.opensVersions && surroundings.versionsShownFor === forge.trackerId;
  return {
    subline:         subline.opensVersions || CONDITIONS_DETAILED_BY_THEIR_START.has(shownCondition) ? subline : null,
    disclosureLabel: `${forge.project}${VERSIONS_DISCLOSURE_LABEL_SUFFIX}`,
    isShown,
    pair:            isShown ? ForgeVersionsTextUtil.pairTextOf(withVersions, gaiaVersions) : null,
    pairSentence:    isShown ? ForgeVersionsTextUtil.pairSentenceOf(withVersions, gaiaVersions) : null,
    quietLine:       isShown ? null : ForgeVersionsTextUtil.quietLineOf(withVersions, gaiaVersions),
  };
}

function updateStatusOf(forge: FleetDocumentForge, commandStates: CommandStates): string | null {
  const updateIsOnItsWay = onItsWayFor(commandStates, forge.trackerId) === 'forge-update';
  return updateIsOnItsWay && forge.versions?.verdict === 'older' ? ForgeVersionsTextUtil.UPDATE_FORGE_TEXT.pending : null;
}

function rowOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeRow {
  const { fleetDocument, surroundings } = rowSurroundings;
  const shownCondition = shownConditionOf(forge, surroundings.commandStates);
  const versions = rowVersionsOf(forge, shownCondition, rowSurroundings);
  const workIsRead = !cannotTalkTo(forge);
  return {
    trackerId:      forge.trackerId,
    project:        forge.project,
    rootText:       PathTextUtil.homeRelativePathOf(forge.root, fleetDocument.gaia.homeFolder),
    rootPath:       forge.root,
    condition:      ForgeTextUtil.dotConditionOf(shownCondition),
    conditionWord:  ForgeTextUtil.conditionWordInSentenceCaseOf(shownCondition),
    conditionTone:  conditionToneOf(shownCondition),
    detailText:     versions === null || versions.subline === null ? detailTextOf(forge, shownCondition, rowSurroundings) : null,
    detailFace:     detailFaceOf(shownCondition, forgeProgramIsMissingFor(forge, rowSurroundings)),
    agents:         agentsCellOf(forge, rowSurroundings),
    waitingCount:   workIsRead ? waitingCountShownOf(forge) : null,
    workIsRead,
    codeText:       forge.codeVersion === null ? null : forge.codeVersion.slice(0, SHORT_CODE_VERSION_CHARACTERS),
    buttons:        buttonsOf(forge, rowSurroundings),
    isInView:       surroundings.forgeInView === forge.trackerId,
    stopDialog:     stopDialogOf(forge, surroundings),
    refusal:        refusalOf(forge.trackerId, surroundings, (kind) => !refusalBelongsToTheHeldBanner(forge, kind)),
    pendingRestart: forge.condition === 'held' ? null : pendingRestartOf(forge, rowSurroundings),
    noticeText:     forge.notices.find((notice) => notice.kind === NOTICE_KIND_OF_ASSISTANT_DOWN)?.text ?? null,
    outageText:     forge.outageEndings === 0 ? null : ForgeTextUtil.outageEndingsTextOf(forge.outageEndings),
    versions,
    updateStatus:   updateStatusOf(forge, surroundings.commandStates),
  };
}

function noticeSentenceOf(forge: FleetDocumentForge): string {
  const heldNotice = forge.notices.find((notice) => notice.kind === NOTICE_KIND_OF_HELD_LAUNCHES);
  return heldNotice?.text ?? HELD_SENTENCE_WITHOUT_NOTICE;
}

function heldBannerOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): HeldBanner {
  const agentsRunning = agentsInFlightOf(forge);
  const keepRunning = agentsRunning === 0 ? null : `Its ${CountTextUtil.countedPhrase(agentsRunning, 'agent keeps', 'agents keep')} running.`;
  const { trackerId } = forge;
  return {
    trackerId,
    project:        forge.project,
    sentence:       [noticeSentenceOf(forge), keepRunning].filter((part) => part !== null).join(' '),
    // A4: Update forge is secondary, so a pending restart's Restart is the held area's one primary.
    updateButton:   commandButton('update', 'Update forge', { kind: 'forge-update', trackerId }, forgeIsBusy(forge, rowSurroundings)),
    refusal:        refusalOf(trackerId, rowSurroundings.surroundings, (kind) => refusalBelongsToTheHeldBanner(forge, kind)),
    pendingRestart: pendingRestartOf(forge, rowSurroundings),
  };
}

function notFoundEntryOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeEntry {
  const { fleetDocument, surroundings } = rowSurroundings;
  return {
    trackerId:  forge.trackerId,
    project:    forge.project,
    condition:  'missing',
    pillWord:   'Missing',
    detailText: `${PathTextUtil.homeRelativePathOf(forge.root, fleetDocument.gaia.homeFolder)}${DETAIL_SEPARATOR}the repository folder is gone`,
    button:     commandButton('hide', 'Hide in Gaia', { kind: 'forge-hide', trackerId: forge.trackerId }, forgeIsBusy(forge, rowSurroundings)),
    isInView:   surroundings.forgeInView === forge.trackerId,
    refusal:    refusalOf(forge.trackerId, surroundings, () => true),
  };
}

function hiddenEntryOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeEntry {
  const { fleetDocument, surroundings } = rowSurroundings;
  return {
    trackerId:  forge.trackerId,
    project:    forge.project,
    condition:  ForgeTextUtil.dotConditionOf(forge.condition),
    pillWord:   null,
    detailText: `${PathTextUtil.homeRelativePathOf(forge.root, fleetDocument.gaia.homeFolder)}${DETAIL_SEPARATOR}${ForgeTextUtil.conditionWordOf(forge.condition)}`,
    button:     commandButton('show-again', 'Show again', { kind: 'forge-unhide', trackerId: forge.trackerId }, forgeIsBusy(forge, rowSurroundings)),
    isInView:   surroundings.forgeInView === forge.trackerId,
    refusal:    refusalOf(forge.trackerId, surroundings, () => true),
  };
}

function machineLimitCommand(limit: number): CommandBody {
  return { kind: 'machine-agent-limit-set', limit };
}

/**
 * The forges whose ready tickets wait for a machine slot, by name, in registry order: `2 in Invoice Service, 1 in Research Wiki`. Only a
 * forge read in full counts, as in the machine's own count; any other keeps what waited before it went out of reach.
 */
function waitingByForgeOf(fleetDocument: FleetDocument): string | null {
  const parts = fleetDocument.forges.flatMap((forge) => {
    const waiting = forge.fidelity === 'full' ? forge.concurrency?.ticketsWaitingForMachineSlot ?? null : null;
    return waiting === null || waiting === 0 ? [] : [`${waiting} in ${forge.project}`];
  });
  return parts.length === 0 ? null : parts.join(', ');
}

function atTheLimitTextOf(fleetDocument: FleetDocument): string {
  const waiting = fleetDocument.machine.ticketsWaitingForMachineSlot;
  if (waiting === null || waiting === 0) return 'The machine is at its limit.';
  const byForge = waitingByForgeOf(fleetDocument);
  const waitingText = `${CountTextUtil.countedPhrase(waiting, 'ready ticket waits', 'ready tickets wait')} for a slot`;
  return `The machine is at its limit. ${waitingText}${byForge === null ? '.' : `: ${byForge}.`}`;
}

/** A count that leaves out a forge Gaia cannot read is a floor, never a guess: `8+`. */
function agentsRunningTextOf(fleetDocument: FleetDocument): string {
  const { agentsInFlight, incompleteFor } = fleetDocument.figures;
  return `${agentsInFlight}${incompleteFor.length === 0 ? '' : '+'}`;
}

function machineFactsOf(fleetDocument: FleetDocument, isAtTheLimit: boolean): MachineFact[] {
  const { machine } = fleetDocument;
  const waiting = machine.ticketsWaitingForMachineSlot;
  const ticketsWaitAtTheLimit = isAtTheLimit && waiting !== null && waiting > 0;
  return [
    { label: 'Agents running', value: agentsRunningTextOf(fleetDocument) },
    { label: 'Asked for by the forges\' own limits', value: String(machine.agentsAskedForByForgeLimits) },
    ...(waiting === null ? [] : [{ label: 'Tickets waiting for a machine slot', value: String(waiting), ...(ticketsWaitAtTheLimit ? { attention: true as const } : {}) }]),
  ];
}

/** `Example Storefront`, `Example Storefront and Invoice Service`, `A, B and C`. */
function namesInASentenceOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

function notCountedTextOf(fleetDocument: FleetDocument): string | null {
  const names = fleetDocument.figures.incompleteFor.flatMap((trackerId) => {
    const forge = FleetDocumentUtil.forgeOf(fleetDocument, trackerId);
    return forge === null ? [] : [forge.project];
  });
  if (names.length === 0) return null;
  return names.length === 1
    ? `${names.join('')} is not counted: this Gaia cannot read its agents.`
    : `${namesInASentenceOf(names)} are not counted: this Gaia cannot read their agents.`;
}

/** Why no machine limit is known: no forge registered, none that answered reports one, or none has answered at all. */
function noMachineLimitSentenceOf(fleetDocument: FleetDocument): string {
  if (fleetDocument.forges.length === 0) return 'No forge is registered to enforce a machine limit.';
  const aForgeAnswered = fleetDocument.forges.some((forge) => forge.fidelity === 'full' || forge.fidelity === 'counts-only');
  return aForgeAnswered ? 'This forge version does not enforce a machine limit.' : 'No running forge has reported a machine limit yet.';
}

/** Without F6 no forge reports a machine limit: the panel says why and its stepper is off. A limit above the CPU count cannot be chosen. */
function machinePanelOf(fleetDocument: FleetDocument, commandStates: CommandStates): MachinePanel {
  const { machineLimit, agentsInFlight } = fleetDocument.figures;
  const { cpuCount } = fleetDocument.machine;
  const cpuSentence = `At most the number of CPUs, which is ${cpuCount} here.`;
  if (machineLimit === null) {
    return {
      limitText:      NO_LIMIT_KNOWN,
      limit:          null,
      lowerCommand:   null,
      raiseCommand:   null,
      stepperIsOff:   true,
      sentence:       noMachineLimitSentenceOf(fleetDocument),
      meter:          null,
      isAtTheLimit:   false,
      atTheLimitText: null,
      facts:          machineFactsOf(fleetDocument, false),
      notCountedText: notCountedTextOf(fleetDocument),
    };
  }
  const isAtTheLimit = agentsInFlight >= machineLimit;
  return {
    limitText:    String(machineLimit),
    limit:        machineLimit,
    lowerCommand: machineLimit <= AGENT_LIMITS.lowestAgents ? null : machineLimitCommand(machineLimit - 1),
    raiseCommand: machineLimit >= cpuCount ? null : machineLimitCommand(machineLimit + 1),
    stepperIsOff: CommandSender.stateOf(commandStates, { fleetCommand: 'machine-agent-limit-set' }).onItsWay !== null,
    sentence:     isAtTheLimit ? cpuSentence : `${cpuSentence} No forge starts an agent past it, whatever its own limit.`,
    meter:        {
      used:     agentsInFlight,
      usedText: agentsRunningTextOf(fleetDocument),
      whole:    machineLimit,
      label:    `${agentsRunningTextOf(fleetDocument)} of ${machineLimit} agents`,
    },
    isAtTheLimit,
    atTheLimitText: isAtTheLimit ? atTheLimitTextOf(fleetDocument) : null,
    facts:          machineFactsOf(fleetDocument, isAtTheLimit),
    notCountedText: notCountedTextOf(fleetDocument),
  };
}

const CONTROLS_NOTE = 'A control stays disabled while its command is on its way. A refusal is the forge\'s own sentence, shown beside the control that caused it.';

/** A control is in use while a command to a forge is on its way, a forge starts, its Stop dialog is open or its refusal shows. */
function controlsAreInUse(fleetDocument: FleetDocument, commandStates: CommandStates, rows: readonly ForgeRow[], heldBanners: readonly HeldBanner[]): boolean {
  return fleetDocument.forges.some((forge) => onItsWayFor(commandStates, forge.trackerId) !== null)
    || rows.some((row) => row.stopDialog !== null || row.refusal !== null || row.buttons.some((button) => button.kind === 'waiting'))
    || heldBanners.some((banner) => banner.refusal !== null);
}

function emptySentenceOf(fleetDocument: FleetDocument, rows: readonly ForgeRow[]): string | null {
  if (fleetDocument.forges.length === 0) return 'No forge is registered on this machine yet.';
  return rows.length === 0 ? 'Every forge here is hidden in Gaia or has lost its repository.' : null;
}

function forgesContentOf(fleetDocument: FleetDocument, surroundings: ForgesSurroundings): ForgesContent {
  const hiddenTrackerIds = hiddenTrackerIdsOf(fleetDocument);
  const rowSurroundings: RowSurroundings = { fleetDocument, surroundings, gaiaHasNoForgeProgram: AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument) };
  const shownForges = fleetDocument.forges.filter((forge) => !hiddenTrackerIds.has(forge.trackerId));
  const tableForges = shownForges.filter((forge) => forge.condition !== 'missing');
  const rows = tableForges.map((forge) => rowOf(forge, rowSurroundings));
  const notFound = shownForges.filter((forge) => forge.condition === 'missing').map((forge) => notFoundEntryOf(forge, rowSurroundings));
  const hidden = fleetDocument.forges.filter((forge) => hiddenTrackerIds.has(forge.trackerId)).map((forge) => hiddenEntryOf(forge, rowSurroundings));
  const heldBanners = tableForges.filter((forge) => forge.condition === 'held').map((forge) => heldBannerOf(forge, rowSurroundings));
  return {
    rows,
    emptySentence: emptySentenceOf(fleetDocument, rows),
    controlsNote:  rows.length > 0 && controlsAreInUse(fleetDocument, surroundings.commandStates, rows, heldBanners) ? CONTROLS_NOTE : null,
    heldBanners,
    notFoundHead:  `Not found${HEAD_SEPARATOR}${notFound.length}`,
    notFound,
    hiddenHead:    `Hidden in Gaia${HEAD_SEPARATOR}${hidden.length}`,
    hidden,
    machine:       machinePanelOf(fleetDocument, surroundings.commandStates),
    versionsNote:  rows.some((row) => row.versions?.subline?.opensVersions === true) ? ForgeVersionsTextUtil.VERSIONS_EXPLANATION : null,
  };
}

export const ForgesModel = {
  forgesContentOf,
  titleFiguresOf,
} as const;
