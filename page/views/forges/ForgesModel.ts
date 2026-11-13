/**
 * What the Forges view shows of a fleet document (SCREENS A4 and B2): the status line, one row per forge with the buttons of its condition,
 * the Stop dialog under the row it stops, a held forge's banner, the forges whose repository is gone, the forges hidden in Gaia, and this
 * machine's agent limit. The command states decide which controls wait for a command on its way and which refusal shows where; the page's
 * clock only prints clock times. A value the document does not hold is absent, never zero.
 */
import type {
  CommandBody,
  CommandKind,
  ForgeCommandBody,
  ForgeStopAgents,
} from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentCondition, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import { CommandSender, type CommandStates }                              from '../../api/CommandSender.ts';
import type { ButtonEmphasis }                                            from '../../design-system/Button.tsx';
import type { DotCondition }                                              from '../../design-system/ConditionDot.tsx';
import { AddRepositoryForm }                                              from '../../shared/add-repository/AddRepositoryForm.ts';
import { CommandFailureTextUtil }                                         from '../../shared/utils/CommandFailureTextUtil.ts';
import { ForgeCommandTextUtil, type StopChoice as StopQuestionChoice }    from '../../shared/utils/ForgeCommandTextUtil.ts';
import { ForgeContractUtil }                                              from '../../shared/utils/ForgeContractUtil.ts';
import { ForgeTextUtil }                                                  from '../../shared/utils/ForgeTextUtil.ts';
import { StampTextUtil }                                                  from '../../shared/utils/StampTextUtil.ts';
import { HashRouter }                                                     from '../../shell/HashRouter.ts';
import type { TopBarStatus }                                              from '../../shell/TopBar.tsx';
import { AGENT_LIMITS }                                                   from './constants/AgentLimits.ts';

/** The page's clock as the model reads it: one reading and the time zone a clock time is printed in. */
export interface ClockReading {
  readonly nowEpochMilliseconds: number;
  readonly timeZone:             string | undefined;
}

/** The Stop dialog open under one row, and the choice it holds. */
export interface StopDialogState {
  readonly trackerId: string;
  readonly agents:    ForgeStopAgents;
}

export interface ForgesSurroundings {
  readonly clock:         ClockReading;
  readonly commandStates: CommandStates;
  readonly stopDialog:    StopDialogState | null;
  /** The row the route names, shown selected and scrolled into view. */
  readonly forgeInView:   string | null;
  /** The last command this view sent to each forge, so "Try again" sends the same limit or the same Stop again. */
  readonly lastSent:      ReadonlyMap<string, ForgeCommandBody>;
}

/** The buttons a row may show, by its condition. */
export type RowButtonKind = 'pause' | 'resume' | 'stop' | 'start' | 'open' | 'open-in-new-tab' | 'look-again' | 'hide';

export type ForgeButtonKind = RowButtonKind | 'update' | 'show-again';

/** A row's button: a command Gaia sends, the Stop that opens its dialog, or a place the page goes. */
export type ForgeButton =
  | {
    readonly kind:     'command';
    readonly button:   ForgeButtonKind;
    readonly label:    string;
    readonly emphasis: ButtonEmphasis;
    readonly iconOnly: boolean;
    readonly command:  CommandBody;
    readonly disabled: boolean;
  }
  | { readonly kind: 'stop'; readonly button: 'stop'; readonly label: string; readonly disabled: boolean }
  | { readonly kind: 'link'; readonly button: 'open'; readonly label: string; readonly href: string; readonly disabled: boolean }
  /** B2: Gaia's own `forge start` is on its way, and its one button says so. */
  | { readonly kind: 'waiting'; readonly label: string };

export type ForgeAgentsCell =
  | {
    readonly kind:         'stepper';
    readonly valueText:    string;
    readonly lowerLabel:   string;
    readonly raiseLabel:   string;
    /** `null` at the lowest limit or at the forge's ceiling: that side is off. */
    readonly lowerCommand: ForgeCommandBody | null;
    readonly raiseCommand: ForgeCommandBody | null;
    readonly disabled:     boolean;
  }
  | { readonly kind: 'text'; readonly text: string };

export type ConditionTone = 'warn' | 'muted';

export interface ShownRefusal {
  readonly commandLabel: string;
  readonly code:         string;
  readonly sentence:     string;
  /** `null` when this view cannot tell what was sent, such as a limit another view set. */
  readonly retryCommand: CommandBody | null;
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

export interface ForgeRow {
  readonly trackerId:     string;
  readonly project:       string;
  readonly rootText:      string;
  readonly condition:     DotCondition;
  readonly conditionWord: string;
  readonly conditionTone: ConditionTone | null;
  readonly detailText:    string | null;
  readonly agents:        ForgeAgentsCell | null;
  readonly waitingText:   string | null;
  readonly codeText:      string | null;
  readonly buttons:       readonly ForgeButton[];
  readonly isInView:      boolean;
  readonly stopDialog:    StopDialog | null;
  readonly refusal:       ShownRefusal | null;
}

export interface HeldBanner {
  readonly trackerId:    string;
  readonly project:      string;
  readonly sentence:     string;
  readonly updateButton: ForgeButton;
  readonly refusal:      ShownRefusal | null;
}

/** A forge outside the table: its repository is gone, or User hid it in Gaia. */
export interface ForgeEntry {
  readonly trackerId:  string;
  readonly project:    string;
  readonly condition:  DotCondition;
  readonly detailText: string;
  readonly button:     ForgeButton;
  readonly isInView:   boolean;
  readonly refusal:    ShownRefusal | null;
}

export interface MachineFact {
  readonly label: string;
  readonly value: string;
}

export interface MachinePanel {
  readonly limitText:      string;
  readonly lowerCommand:   CommandBody | null;
  readonly raiseCommand:   CommandBody | null;
  /** Off when no forge enforces a limit, and while a limit is on its way. */
  readonly stepperIsOff:   boolean;
  readonly sentence:       string;
  readonly meter:          { readonly used: number; readonly whole: number; readonly label: string } | null;
  readonly isAtTheLimit:   boolean;
  readonly atTheLimitText: string | null;
  readonly facts:          readonly MachineFact[];
}

export interface ForgesContent {
  readonly rows:          readonly ForgeRow[];
  /** What the table's place says when it holds no row. */
  readonly emptySentence: string | null;
  readonly heldBanners:   readonly HeldBanner[];
  readonly notFoundHead:  string;
  readonly notFound:      readonly ForgeEntry[];
  readonly hiddenHead:    string;
  readonly hidden:        readonly ForgeEntry[];
  readonly machine:       MachinePanel;
}

const HEAD_SEPARATOR = ' · ';
const DETAIL_SEPARATOR = ' · ';
const SHORT_CODE_VERSION_LENGTH = 7;
const HOME_MARK = '~';

/** What the machine panel's limit shows while no forge reports one. */
const NO_LIMIT_KNOWN = '—';

/** The conditions under which a forge's Overseer runs. */
const RUNNING_CONDITIONS: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'passing-baton']);

/** The fidelities at which the forge's Overseer answered its last read, so a command it carries reaches it. */
const OVERSEER_ANSWERS_AT: ReadonlySet<FleetDocumentForge['fidelity']> = new Set(['full', 'counts-only', 'newer-contract']);

/** SCREENS A4: which buttons each condition shows. Open is left out where the forge cannot open in place (F5). */
const BUTTONS_BY_CONDITION: Readonly<Record<FleetDocumentCondition, readonly RowButtonKind[]>> = {
  'live':          ['pause', 'stop', 'open', 'open-in-new-tab'],
  'paused':        ['resume', 'stop', 'open', 'open-in-new-tab'],
  'held':          ['stop', 'open', 'open-in-new-tab'],
  'passing-baton': [],
  'starting':      [],
  'dormant':       ['start'],
  'unreachable':   ['look-again', 'stop'],
  'unreadable':    ['open-in-new-tab'],
  'missing':       ['hide'],
};

const NOTICE_KIND_OF_HELD_LAUNCHES = 'install-version-changed';

const HELD_SENTENCE_WITHOUT_NOTICE = 'Its install version changed. Nothing launches until this forge is updated.';

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

function clockTextOf(stamp: string | null, clock: ClockReading): string | null {
  return stamp === null ? null : StampTextUtil.clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone);
}

/** A path under the home folder is printed from `~`, as the artboards print it. */
function rootTextOf(root: string, homeFolder: string): string {
  return root === homeFolder || root.startsWith(`${homeFolder}/`) ? `${HOME_MARK}${root.slice(homeFolder.length)}` : root;
}

function hiddenTrackerIdsOf(fleetDocument: FleetDocument): ReadonlySet<string> {
  return new Set(fleetDocument.settings.hiddenTrackerIds);
}

function onItsWayFor(commandStates: CommandStates, trackerId: string): CommandKind | null {
  return CommandSender.stateOf(commandStates, { trackerId }).onItsWay;
}

/** Gaia's own `forge start` on its way shows a dormant forge as starting until the document reports what came of it. */
function shownConditionOf(forge: FleetDocumentForge, commandStates: CommandStates): FleetDocumentCondition {
  return forge.condition === 'dormant' && onItsWayFor(commandStates, forge.trackerId) === 'forge-start' ? 'starting' : forge.condition;
}

/** The top bar's line: every registered forge, hidden ones too, and how many run or start by the document's own word. */
function statusOf(fleetDocument: FleetDocument): TopBarStatus {
  const { forges } = fleetDocument;
  if (forges.length === 0) return { condition: null, text: 'no forge registered on this machine yet' };
  const running = forges.filter((forge) => RUNNING_CONDITIONS.has(forge.condition)).length;
  const starting = forges.filter((forge) => forge.condition === 'starting').length;
  const runningText = `${running} running${starting === 0 ? '' : `, ${starting} starting`}`;
  return { condition: null, text: `${forges.length} registered on this machine${HEAD_SEPARATOR}${runningText}` };
}

function apiCarriesCommandsTo(forge: FleetDocumentForge): boolean {
  return OVERSEER_ANSWERS_AT.has(forge.fidelity) && ForgeContractUtil.controlContractIsKnown(forge);
}

/** A Stop reaches an answering Overseer only in the control contract Gaia knows; with none answering, the forge program stops the forge. */
function stopReaches(forge: FleetDocumentForge): boolean {
  return !OVERSEER_ANSWERS_AT.has(forge.fidelity) || ForgeContractUtil.controlContractIsKnown(forge);
}

interface RowSurroundings {
  readonly fleetDocument:         FleetDocument;
  readonly surroundings:          ForgesSurroundings;
  readonly forgeProgramIsMissing: boolean;
}

/** The Stop dialog stays only under a row that still offers a Stop that reaches its forge; a forge stopped meanwhile drops it. */
function stopDialogIsOpenOn(forge: FleetDocumentForge, stopDialog: StopDialogState | null): boolean {
  return stopDialog?.trackerId === forge.trackerId && BUTTONS_BY_CONDITION[forge.condition].includes('stop') && stopReaches(forge);
}

function forgeIsBusy(forge: FleetDocumentForge, { surroundings }: RowSurroundings): boolean {
  return onItsWayFor(surroundings.commandStates, forge.trackerId) !== null || stopDialogIsOpenOn(forge, surroundings.stopDialog);
}

function commandButton(button: ForgeButtonKind, label: string, command: CommandBody, disabled: boolean, emphasis: ButtonEmphasis = 'plain'): ForgeButton {
  return {
    kind:     'command',
    button,
    label,
    emphasis,
    iconOnly: button === 'open-in-new-tab',
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
    case 'resume':
      return commandButton(button, 'Resume', { kind: 'forge-resume', trackerId }, isBusy || !apiCarriesCommandsTo(forge), 'primary');
    case 'stop':
      return {
        kind: 'stop', button, label: 'Stop', disabled: isBusy || !stopReaches(forge)
      };
    case 'start':
      return commandButton(button, 'Start', { kind: 'forge-start', trackerId }, isBusy || rowSurroundings.forgeProgramIsMissing, 'primary');
    case 'open':
      if (!ForgeContractUtil.canOpenInPlace(forge)) return null;
      return {
        kind:     'link',
        button,
        label:    'Open',
        href:     HashRouter.fragmentOf({ view: 'forge', trackerId, bridgeFragment: null }),
        disabled: isBusy,
      };
    case 'open-in-new-tab':
      return commandButton(button, `Open ${forge.project} in a new tab`, { kind: 'forge-open-in-browser', trackerId }, isBusy);
    case 'look-again': {
      const lookAgainIsOnItsWay = CommandSender.stateOf(rowSurroundings.surroundings.commandStates, { fleetCommand: 'fleet-look-again' }).onItsWay !== null;
      return commandButton(button, 'Look again', { kind: 'fleet-look-again' }, lookAgainIsOnItsWay);
    }
    case 'hide':
      return commandButton(button, 'Hide in Gaia', { kind: 'forge-hide', trackerId }, isBusy);
  }
}

function buttonsOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeButton[] {
  if (shownConditionOf(forge, rowSurroundings.surroundings.commandStates) !== forge.condition) return [{ kind: 'waiting', label: 'Starting' }];
  return BUTTONS_BY_CONDITION[forge.condition].flatMap((button) => {
    const shown = buttonOf(button, forge, rowSurroundings);
    return shown === null ? [] : [shown];
  });
}

function agentsInFlightOf(forge: FleetDocumentForge): number {
  return forge.concurrency?.agentsInFlight ?? forge.agents.length;
}

function detailTextOf(forge: FleetDocumentForge, shownCondition: FleetDocumentCondition, rowSurroundings: RowSurroundings): string | null {
  const { clock } = rowSurroundings.surroundings;
  switch (shownCondition) {
    case 'live':
    case 'held':
    case 'passing-baton': {
      const startedClock = clockTextOf(forge.overseerStartedAt, clock);
      return startedClock === null ? null : `since ${startedClock}`;
    }
    case 'paused': {
      const finishing = agentsInFlightOf(forge);
      return [finishing === 0 ? null : countedPhrase(finishing, 'agent finishing', 'agents finishing'), 'starts no new job'].filter((part) => part !== null).join(DETAIL_SEPARATOR);
    }
    case 'starting':
      return `forge start${DETAIL_SEPARATOR}waiting for its API`;
    case 'dormant': {
      if (rowSurroundings.forgeProgramIsMissing) return 'the forge program was not found';
      const stoppedClock = clockTextOf(forge.lastChangedAt, clock);
      return stoppedClock === null ? null : `stopped ${stoppedClock}`;
    }
    case 'unreachable': {
      const lastReported = clockTextOf(forge.lastReportedAt, clock);
      return lastReported === null ? 'stopped answering' : `as last reported ${lastReported}`;
    }
    case 'unreadable':
      return 'newer than this Gaia';
    case 'missing':
      return 'the repository folder is gone';
  }
}

function conditionToneOf(condition: FleetDocumentCondition): ConditionTone | null {
  if (condition === 'held') return 'warn';
  if (condition === 'dormant' || condition === 'missing') return 'muted';
  return null;
}

/** The forge's own limit, between one agent and the forge's ceiling; a stepper only while its Overseer runs and is read in full. */
function agentsCellOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeAgentsCell | null {
  const { concurrency, trackerId, project } = forge;
  if (concurrency === null) return null;
  const valueText = `${concurrency.agentsInFlight} / ${concurrency.limit}`;
  const overseerRuns = RUNNING_CONDITIONS.has(forge.condition) && forge.fidelity === 'full';
  if (!overseerRuns) return { kind: 'text', text: valueText };
  const { limit } = concurrency;
  return {
    kind:         'stepper',
    valueText,
    lowerLabel:   `Lower ${project}'s agent limit`,
    raiseLabel:   `Raise ${project}'s agent limit`,
    lowerCommand: limit <= AGENT_LIMITS.lowestAgents ? null : { kind: 'forge-concurrency-set', trackerId, limit: limit - 1 },
    raiseCommand: limit >= AGENT_LIMITS.forgeCeilingAgents ? null : { kind: 'forge-concurrency-set', trackerId, limit: limit + 1 },
    disabled:     forgeIsBusy(forge, rowSurroundings) || !apiCarriesCommandsTo(forge),
  };
}

function waitingTextOf(forge: FleetDocumentForge): string | null {
  const count = forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
  return count === null || count === 0 ? null : String(count);
}

/** A command that names only its forge can be sent again from its kind alone; any other only as this view last sent it. */
function retryCommandOf(kind: CommandKind, trackerId: string, lastSent: ForgeCommandBody | undefined): CommandBody | null {
  if (lastSent?.kind === kind) return lastSent;
  switch (kind) {
    case 'forge-start':
    case 'forge-pause':
    case 'forge-resume':
    case 'forge-restart':
    case 'forge-update':
    case 'forge-open-in-browser':
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
  const { code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
  return {
    commandLabel,
    code,
    sentence,
    retryCommand: retryCommandOf(failure.kind, trackerId, surroundings.lastSent.get(trackerId)),
  };
}

/**
 * B2: the dialog under the row it stops. With no agent running there is nothing to choose, nor for an Overseer that does not answer Gaia,
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

/** A held forge's Update forge sits on its banner, so its refusal shows there and not under the row. */
function refusalShowsOnTheRow(forge: FleetDocumentForge): (kind: CommandKind) => boolean {
  return (kind) => !(forge.condition === 'held' && kind === 'forge-update');
}

function rowOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeRow {
  const { fleetDocument, surroundings } = rowSurroundings;
  const shownCondition = shownConditionOf(forge, surroundings.commandStates);
  return {
    trackerId:     forge.trackerId,
    project:       forge.project,
    rootText:      rootTextOf(forge.root, fleetDocument.gaia.homeFolder),
    condition:     ForgeTextUtil.dotConditionOf(shownCondition),
    conditionWord: ForgeTextUtil.conditionWordInSentenceCaseOf(shownCondition),
    conditionTone: conditionToneOf(shownCondition),
    detailText:    detailTextOf(forge, shownCondition, rowSurroundings),
    agents:        agentsCellOf(forge, rowSurroundings),
    waitingText:   waitingTextOf(forge),
    codeText:      forge.codeVersion === null ? null : forge.codeVersion.slice(0, SHORT_CODE_VERSION_LENGTH),
    buttons:       buttonsOf(forge, rowSurroundings),
    isInView:      surroundings.forgeInView === forge.trackerId,
    stopDialog:    stopDialogOf(forge, surroundings),
    refusal:       refusalOf(forge.trackerId, surroundings, refusalShowsOnTheRow(forge)),
  };
}

function noticeSentenceOf(forge: FleetDocumentForge): string {
  const heldNotice = forge.notices.find((notice) => notice.kind === NOTICE_KIND_OF_HELD_LAUNCHES);
  return heldNotice?.text ?? HELD_SENTENCE_WITHOUT_NOTICE;
}

function heldBannerOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): HeldBanner {
  const agentsRunning = agentsInFlightOf(forge);
  const keepRunning = agentsRunning === 0 ? null : `Its ${countedPhrase(agentsRunning, 'agent keeps', 'agents keep')} running.`;
  const { trackerId } = forge;
  return {
    trackerId,
    project:      forge.project,
    sentence:     [noticeSentenceOf(forge), keepRunning].filter((part) => part !== null).join(' '),
    updateButton: commandButton('update', 'Update forge', { kind: 'forge-update', trackerId }, forgeIsBusy(forge, rowSurroundings), 'primary'),
    refusal:      refusalOf(trackerId, rowSurroundings.surroundings, (kind) => kind === 'forge-update'),
  };
}

function notFoundEntryOf(forge: FleetDocumentForge, rowSurroundings: RowSurroundings): ForgeEntry {
  const { fleetDocument, surroundings } = rowSurroundings;
  return {
    trackerId:  forge.trackerId,
    project:    forge.project,
    condition:  'missing',
    detailText: `${rootTextOf(forge.root, fleetDocument.gaia.homeFolder)}${DETAIL_SEPARATOR}the repository folder is gone`,
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
    detailText: `${rootTextOf(forge.root, fleetDocument.gaia.homeFolder)}${DETAIL_SEPARATOR}${ForgeTextUtil.conditionWordOf(forge.condition)}`,
    button:     commandButton('show-again', 'Show again', { kind: 'forge-unhide', trackerId: forge.trackerId }, forgeIsBusy(forge, rowSurroundings)),
    isInView:   surroundings.forgeInView === forge.trackerId,
    refusal:    refusalOf(forge.trackerId, surroundings, () => true),
  };
}

function machineLimitCommand(limit: number): CommandBody {
  return { kind: 'machine-agent-limit-set', limit };
}

/** The forges whose ready tickets wait for a machine slot, by name, in registry order: `2 in Invoice Service, 1 in Research Wiki`. */
function waitingByForgeOf(fleetDocument: FleetDocument): string | null {
  const parts = fleetDocument.forges.flatMap((forge) => {
    const waiting = forge.concurrency?.ticketsWaitingForMachineSlot ?? null;
    return waiting === null || waiting === 0 ? [] : [`${waiting} in ${forge.project}`];
  });
  return parts.length === 0 ? null : parts.join(', ');
}

function atTheLimitTextOf(fleetDocument: FleetDocument): string {
  const waiting = fleetDocument.machine.ticketsWaitingForMachineSlot;
  if (waiting === null || waiting === 0) return 'The machine is at its limit.';
  const byForge = waitingByForgeOf(fleetDocument);
  const waitingText = `${countedPhrase(waiting, 'ready ticket waits', 'ready tickets wait')} for a slot`;
  return `The machine is at its limit. ${waitingText}${byForge === null ? '.' : `: ${byForge}.`}`;
}

function machineFactsOf(fleetDocument: FleetDocument): MachineFact[] {
  const { figures, machine } = fleetDocument;
  return [
    { label: 'Agents running', value: String(figures.agentsInFlight) },
    { label: 'Asked for by the forges\' own limits', value: String(machine.agentsAskedForByForgeLimits) },
    ...(machine.ticketsWaitingForMachineSlot === null ? [] : [{ label: 'Tickets waiting for a machine slot', value: String(machine.ticketsWaitingForMachineSlot) }]),
  ];
}

/** Without F6 no forge reports a machine limit: the panel says so and its stepper is off. A limit above the CPU count cannot be chosen. */
function machinePanelOf(fleetDocument: FleetDocument, commandStates: CommandStates): MachinePanel {
  const { machineLimit, agentsInFlight } = fleetDocument.figures;
  const { cpuCount } = fleetDocument.machine;
  const cpuSentence = `At most the number of CPUs, which is ${cpuCount} here.`;
  if (machineLimit === null) {
    return {
      limitText:      NO_LIMIT_KNOWN,
      lowerCommand:   null,
      raiseCommand:   null,
      stepperIsOff:   true,
      sentence:       fleetDocument.forges.length === 0 ? 'No forge is registered to enforce a machine limit.' : 'This forge version does not enforce a machine limit.',
      meter:          null,
      isAtTheLimit:   false,
      atTheLimitText: null,
      facts:          machineFactsOf(fleetDocument),
    };
  }
  const isAtTheLimit = agentsInFlight >= machineLimit;
  return {
    limitText:      String(machineLimit),
    lowerCommand:   machineLimit <= AGENT_LIMITS.lowestAgents ? null : machineLimitCommand(machineLimit - 1),
    raiseCommand:   machineLimit >= cpuCount ? null : machineLimitCommand(machineLimit + 1),
    stepperIsOff:   CommandSender.stateOf(commandStates, { fleetCommand: 'machine-agent-limit-set' }).onItsWay !== null,
    sentence:       isAtTheLimit ? cpuSentence : `${cpuSentence} No forge starts an agent past it, whatever its own limit.`,
    meter:          { used: agentsInFlight, whole: machineLimit, label: `${agentsInFlight} of ${machineLimit} agents` },
    isAtTheLimit,
    atTheLimitText: isAtTheLimit ? atTheLimitTextOf(fleetDocument) : null,
    facts:          machineFactsOf(fleetDocument),
  };
}

function emptySentenceOf(fleetDocument: FleetDocument, rows: readonly ForgeRow[]): string | null {
  if (fleetDocument.forges.length === 0) return 'No forge is registered on this machine yet.';
  return rows.length === 0 ? 'Every forge here is hidden in Gaia or has lost its repository.' : null;
}

function forgesContentOf(fleetDocument: FleetDocument, surroundings: ForgesSurroundings): ForgesContent {
  const hiddenTrackerIds = hiddenTrackerIdsOf(fleetDocument);
  const rowSurroundings: RowSurroundings = { fleetDocument, surroundings, forgeProgramIsMissing: AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument) };
  const shownForges = fleetDocument.forges.filter((forge) => !hiddenTrackerIds.has(forge.trackerId));
  const tableForges = shownForges.filter((forge) => forge.condition !== 'missing');
  const rows = tableForges.map((forge) => rowOf(forge, rowSurroundings));
  const notFound = shownForges.filter((forge) => forge.condition === 'missing').map((forge) => notFoundEntryOf(forge, rowSurroundings));
  const hidden = fleetDocument.forges.filter((forge) => hiddenTrackerIds.has(forge.trackerId)).map((forge) => hiddenEntryOf(forge, rowSurroundings));
  return {
    rows,
    emptySentence: emptySentenceOf(fleetDocument, rows),
    heldBanners:   tableForges.filter((forge) => forge.condition === 'held').map((forge) => heldBannerOf(forge, rowSurroundings)),
    notFoundHead:  `Not found${HEAD_SEPARATOR}${notFound.length}`,
    notFound,
    hiddenHead:    `Hidden in Gaia${HEAD_SEPARATOR}${hidden.length}`,
    hidden,
    machine:       machinePanelOf(fleetDocument, surroundings.commandStates),
  };
}

export const ForgesModel = {
  forgesContentOf,
  statusOf,
} as const;
