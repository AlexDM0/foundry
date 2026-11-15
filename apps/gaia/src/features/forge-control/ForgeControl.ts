/**
 * Carries out one command (PLAN 8.2) and answers a verdict, never a throw. The forge's API carries what an Overseer does while it answers
 * and its control contract is known; the forge program carries the rest; Gaia's settings carry what is Gaia's own, and each forge's program
 * its login item when "Start at login" changes. One command per forge, per repository being added, for the machine limit, for the chooser
 * and for the login items is on its way at a time.
 */
import type { ForgeControlCommand }      from 'overseer-contracts/ForgeControlCommand';
import { FLINT_BRAIN_CONTRACT_VERSIONS } from 'overseer-contracts/OverseerContractVersions';

import { OverseerTokenFile }                                         from '../../adapters/forge-api/OverseerTokenFile.ts';
import type { ForgeProgram, ForgeProgramTarget }                     from '../../adapters/forge-program/ForgeProgram.ts';
import type { RegisteredForge, RegisteredOverseer }                  from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { registeredForgesOf, type RegistryReading }                  from '../../adapters/forge-registry/RegistryFile.ts';
import type { PathChoiceVerdict }                                    from '../../adapters/path-chooser/@types/PathChoiceVerdict.ts';
import type { PathChooser }                                          from '../../adapters/path-chooser/PathChooser.ts';
import type { ForgeCommandAnswer }                                   from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                                          from '../../lib/forge-client/ForgeClient.ts';
import type { SettingsStore, SettingsUpdate, SettingsUpdateVerdict } from '../../services/SettingsStore.ts';
import type { CommandVerdict, GaiaRefusal, RegistryRefusal }         from '../../shared/@types/CommandVerdict.ts';
import type { ForgeFidelity, ForgeReading }                          from '../../shared/@types/ForgeReading.ts';
import type {
  ForgeCommand,
  ForgeStopAgents,
  GaiaCommand,
  SettingsChange,
} from '../../shared/@types/GaiaCommand.ts';
import type { GaiaSettings }                               from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS, OLDER_CONTRACT_VERSIONS_READ } from '../../shared/constants/ContractVersions.ts';
import { OVERSEER_ANSWERED_FIDELITIES }                    from '../../shared/constants/ForgeFidelities.ts';

import { ProgramVerdictUtil } from './utils/ProgramVerdictUtil.ts';

export interface ForgeControlOptions {
  /** Read at each command, so the program and the Overseer's token file are the ones the registry names now. */
  readonly readRegistry:  () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether an Overseer answers and which control contract it speaks. */
  readonly readings:      () => readonly ForgeReading[];
  readonly forgeClient:   ForgeClient;
  readonly forgeProgram:  ForgeProgram;
  readonly settingsStore: Pick<SettingsStore, 'settings' | 'fileState' | 'update'>;
  readonly pathChooser:   PathChooser;
  /** A registry read and an identity round at once. */
  readonly lookAgain:     () => Promise<void>;
}

export interface ForgeControl {
  readonly carry: (command: GaiaCommand) => Promise<CommandVerdict>;
}

/** The machine limit, the chooser and the login items are one each, whatever the forge; a forge and a repository being added are named. */
const MACHINE_LIMIT_SUBJECT = 'machine-limit';
const PATH_CHOOSER_SUBJECT = 'path-chooser';
const LOGIN_ITEMS_SUBJECT = 'login-items';

/** The forges that get a login item when "Start at login" is switched on: their Overseer answered, in a contract Gaia reads. */
const RUNNING_FOR_LOGIN_ITEMS_AT: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only']);

/** The forges whose login item goes when it is switched off: every one Gaia read whose repository is there and whose contract it reads. */
const LOGIN_ITEM_REMOVED_AT: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only', 'unreachable', 'dormant']);

/** The control majors Gaia sends to, at any minor: the current one, and the older ones, which lack only the commands the later ones add. */
const CONTROL_VERSIONS_SENT: ReadonlySet<number> = new Set([CONTRACT_VERSIONS.forgeControl.major, ...OLDER_CONTRACT_VERSIONS_READ.forgeControl]);

/**
 * `api`: the Overseer answers and speaks a control contract Gaia sends to, named by `controlVersion`. `control-unknown`: it answers in
 * another contract or names none. `no-overseer`: no Overseer answered the last read, or the registry now names another address than the
 * one the watch read, so the contract read is not that Overseer's.
 */
type ApiReach =
  | { readonly reach: 'api'; readonly overseer: RegisteredOverseer; readonly controlVersion: number }
  | { readonly reach: 'control-unknown' }
  | { readonly reach: 'no-overseer' };

function gaiaRefusalOf(refusal: GaiaRefusal): CommandVerdict {
  return { verdict: 'refused', refusedBy: 'gaia', refusal };
}

function apiReachOf(forge: RegisteredForge, reading: ForgeReading | null): ApiReach {
  const { overseer } = forge;
  if (overseer === null || reading === null || reading.url !== overseer.url || !OVERSEER_ANSWERED_FIDELITIES.has(reading.fidelity)) return { reach: 'no-overseer' };
  const controlVersion = reading.contracts.control;
  return controlVersion !== null && CONTROL_VERSIONS_SENT.has(controlVersion) ? { reach: 'api', overseer, controlVersion } : { reach: 'control-unknown' };
}

function programTargetOf(forge: RegisteredForge): ForgeProgramTarget {
  return { root: forge.root, program: forge.program };
}

function verdictOfApiFailure(answer: Exclude<ForgeCommandAnswer, { verdict: 'answered' }>): CommandVerdict {
  switch (answer.verdict) {
    case 'unreachable':
      return { verdict: 'unreachable' };
    case 'unauthorized':
      return gaiaRefusalOf('token-rejected');
    case 'refused':
      return {
        verdict: 'refused', refusedBy: 'forge', refusal: answer.refusal, text: answer.text,
      };
    case 'malformed':
      return { verdict: 'not-supported' };
  }
}

/** No answer came, or no request went out for want of a token: the forge program, or the next live forge, may still carry the command. */
function apiLeftTheCommandUncarried(apiVerdict: CommandVerdict): boolean {
  if (apiVerdict.verdict === 'unreachable') return true;
  return apiVerdict.verdict === 'refused' && apiVerdict.refusedBy === 'gaia' && apiVerdict.refusal === 'token-unreadable';
}

function verdictOfSettingsUpdate(updateVerdict: SettingsUpdateVerdict): CommandVerdict {
  switch (updateVerdict.verdict) {
    case 'written':
      return { verdict: 'done' };
    case 'unchanged':
      return { verdict: 'nothing-to-do' };
    case 'kept-newer-version':
      return gaiaRefusalOf('settings-newer-version');
    case 'unwritable':
      return gaiaRefusalOf('settings-unwritable');
  }
}

/** Nobody chose, whether User cancelled or nobody answered: there is nothing to do with the choice. */
function verdictOfPathChoice(choiceVerdict: PathChoiceVerdict): CommandVerdict {
  switch (choiceVerdict.verdict) {
    case 'chosen':
      return { verdict: 'path-chosen', path: choiceVerdict.path };
    case 'cancelled':
    case 'timed-out':
      return { verdict: 'nothing-to-do' };
    case 'chooser-not-found':
      return { verdict: 'not-supported' };
    case 'failed':
      return gaiaRefusalOf('path-chooser-failed');
  }
}

function hiding(trackerId: string): SettingsUpdate {
  return (settings) => (settings.hiddenTrackerIds.includes(trackerId) ? null : { ...settings, hiddenTrackerIds: [...settings.hiddenTrackerIds, trackerId] });
}

function showingAgain(trackerId: string): SettingsUpdate {
  return (settings) => {
    if (!settings.hiddenTrackerIds.includes(trackerId)) return null;
    return { ...settings, hiddenTrackerIds: settings.hiddenTrackerIds.filter((hiddenTrackerId) => hiddenTrackerId !== trackerId) };
  };
}

function settingsWith(settings: GaiaSettings, change: SettingsChange): GaiaSettings {
  return { ...settings, [change.key]: change.value };
}

function changing(change: SettingsChange): SettingsUpdate {
  return (settings) => (Bun.deepEquals(settings[change.key], change.value, true) ? null : settingsWith(settings, change));
}

/** What a command holds while it is on its way, so a second command to the same holds back; `null` for one that holds nothing. */
function subjectOf(command: GaiaCommand): string | null {
  switch (command.kind) {
    case 'fleet-look-again':
      return null;
    case 'settings-set':
      return command.change.key === 'startForgesAtLogin' ? LOGIN_ITEMS_SUBJECT : null;
    case 'forge-add':
      return `repository ${command.root}`;
    case 'machine-agent-limit-set':
      return MACHINE_LIMIT_SUBJECT;
    case 'path-choose':
      return PATH_CHOOSER_SUBJECT;
    default:
      return `forge ${command.trackerId}`;
  }
}

export function createForgeControl(options: ForgeControlOptions): ForgeControl {
  const { forgeClient, forgeProgram, settingsStore } = options;
  const subjectsWithCommandInFlight = new Set<string>();

  async function registeredForges(): Promise<readonly RegisteredForge[] | RegistryRefusal> {
    return registeredForgesOf(await options.readRegistry());
  }

  function readingOf(trackerId: string): ForgeReading | null {
    return options.readings().find((reading) => reading.trackerId === trackerId) ?? null;
  }

  /** Sends the commands in order and stops at the first that is not taken; done when any of them changed something. */
  async function sendOverApi(overseer: RegisteredOverseer, controlCommands: readonly ForgeControlCommand[]): Promise<CommandVerdict> {
    const bearerToken = overseer.tokenPath === null ? null : await new OverseerTokenFile(overseer.tokenPath).read();
    if (bearerToken === null) return gaiaRefusalOf('token-unreadable');
    const access = { overseerUrl: overseer.url, bearerToken };
    let anyCommandChangedSomething = false;
    for (const controlCommand of controlCommands) {
      const answer = await forgeClient.send(access, controlCommand);
      if (answer.verdict !== 'answered') return verdictOfApiFailure(answer);
      if (answer.outcome === 'done') anyCommandChangedSomething = true;
    }
    return { verdict: anyCommandChangedSomething ? 'done' : 'nothing-to-do' };
  }

  /** A command only a running Overseer can carry out. */
  async function carryOverApi(forge: RegisteredForge, reading: ForgeReading | null, controlCommand: ForgeControlCommand): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'no-overseer') return { verdict: 'unreachable' };
    return sendOverApi(apiReach.overseer, [controlCommand]);
  }

  /** A command of Flint's brain, which only an Overseer at a control contract that serves the brain is sent; Gaia refuses it under an older one. */
  async function carryBrainCommand(forge: RegisteredForge, reading: ForgeReading | null, controlCommand: ForgeControlCommand): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'no-overseer') return { verdict: 'unreachable' };
    if (apiReach.controlVersion < FLINT_BRAIN_CONTRACT_VERSIONS.control) return gaiaRefusalOf('brain-not-served');
    return sendOverApi(apiReach.overseer, [controlCommand]);
  }

  /**
   * The contract check comes before the carrier: an Overseer that answers in a control contract Gaia does not know is sent nothing and
   * left running. With no Overseer answering, none answering the stop, or no token to send it with, the forge program stops the forge.
   */
  async function stop(forge: RegisteredForge, reading: ForgeReading | null, agents: ForgeStopAgents): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'api') {
      const overseerStop: ForgeControlCommand = { kind: 'overseer-stop', now: false };
      const controlCommands: readonly ForgeControlCommand[] = agents === 'stop-first' ? [{ kind: 'job-stop-all', mode: 'stop' }, overseerStop] : [overseerStop];
      const apiVerdict = await sendOverApi(apiReach.overseer, controlCommands);
      if (!apiLeftTheCommandUncarried(apiVerdict)) return apiVerdict;
    }
    return ProgramVerdictUtil.verdictOfProgram(await forgeProgram.stop(programTargetOf(forge)), (answer) => answer.outcome);
  }

  /** `forge init`, then `forge start`, in the repository's root; the first refusal ends the add, and the forge words it. */
  async function add(root: string, project: string): Promise<CommandVerdict> {
    const target: ForgeProgramTarget = { root, program: null };
    const initVerdict = await forgeProgram.init(target, project);
    if (initVerdict.verdict !== 'done') return ProgramVerdictUtil.verdictOfProgramFailure(initVerdict);
    const startVerdict = await forgeProgram.start(target);
    if (startVerdict.verdict !== 'done') return ProgramVerdictUtil.verdictOfProgramFailure(startVerdict);
    return { verdict: initVerdict.answer.outcome === 'created' || startVerdict.answer.started ? 'done' : 'nothing-to-do' };
  }

  /**
   * The limit is the machine's, so any live forge whose control contract Gaia knows carries it; the next is asked when one gives no answer
   * or its token cannot be read. With none live, the forge program of a registered forge whose repository is there sets it.
   */
  async function setMachineLimit(limit: number): Promise<CommandVerdict> {
    const forges = await registeredForges();
    if (typeof forges === 'string') return gaiaRefusalOf(forges);
    for (const forge of forges) {
      const apiReach = apiReachOf(forge, readingOf(forge.trackerId));
      if (apiReach.reach !== 'api') continue;
      const apiVerdict = await sendOverApi(apiReach.overseer, [{ kind: 'machine-agent-limit-set', limit }]);
      if (!apiLeftTheCommandUncarried(apiVerdict)) return apiVerdict;
    }
    const forgeWithItsRepository = forges.find((forge) => readingOf(forge.trackerId)?.fidelity !== 'repository-missing');
    if (forgeWithItsRepository === undefined) return gaiaRefusalOf('no-forge-registered');
    return ProgramVerdictUtil.verdictOfProgram(await forgeProgram.machineLimitSet(programTargetOf(forgeWithItsRepository), limit), (answer) => answer.outcome);
  }

  /** Each forge's program undoes the change just made to its login item; one that refuses is passed over: the refusal that led here is the answer. */
  async function undoLoginItemsOf(forges: readonly RegisteredForge[], startForgesAtLogin: boolean): Promise<void> {
    for (const forge of forges) await forgeProgram.loginItem(programTargetOf(forge), startForgesAtLogin ? 'remove' : 'add');
  }

  /**
   * PLAN A6: switched on, each running forge's own program writes its login item; switched off, each forge's program removes it. The
   * setting is kept only once every forge's verb is done, so the first refusal leaves it as it was and the forge words why. A refusal, of a
   * forge or of the settings write, turns back the login items already changed: the page shows the setting as it was, and offers no change
   * that would turn them back.
   */
  async function setStartForgesAtLogin(startForgesAtLogin: boolean): Promise<CommandVerdict> {
    if (settingsStore.settings().startForgesAtLogin === startForgesAtLogin) return { verdict: 'nothing-to-do' };
    if (settingsStore.fileState() === 'newer-version') return gaiaRefusalOf('settings-newer-version');
    const registeredForgeList = await registeredForges();
    if (typeof registeredForgeList === 'string') return gaiaRefusalOf(registeredForgeList);
    const forgeFidelities = startForgesAtLogin ? RUNNING_FOR_LOGIN_ITEMS_AT : LOGIN_ITEM_REMOVED_AT;
    const forges = registeredForgeList.filter((forge) => {
      const reading = readingOf(forge.trackerId);
      return reading !== null && forgeFidelities.has(reading.fidelity);
    });
    const forgesWithTheirLoginItemChanged: RegisteredForge[] = [];
    for (const forge of forges) {
      const loginItemVerdict = await forgeProgram.loginItem(programTargetOf(forge), startForgesAtLogin ? 'add' : 'remove');
      if (loginItemVerdict.verdict !== 'done') {
        await undoLoginItemsOf(forgesWithTheirLoginItemChanged, startForgesAtLogin);
        return ProgramVerdictUtil.verdictOfProgramFailure(loginItemVerdict);
      }
      forgesWithTheirLoginItemChanged.push(forge);
    }
    const settingsVerdict = verdictOfSettingsUpdate(await settingsStore.update(changing({ key: 'startForgesAtLogin', value: startForgesAtLogin })));
    if (settingsVerdict.verdict === 'refused') await undoLoginItemsOf(forgesWithTheirLoginItemChanged, startForgesAtLogin);
    return settingsVerdict;
  }

  async function carryForForge(command: ForgeCommand): Promise<CommandVerdict> {
    if (command.kind === 'forge-unhide') return verdictOfSettingsUpdate(await settingsStore.update(showingAgain(command.trackerId)));
    const forges = await registeredForges();
    if (typeof forges === 'string') return gaiaRefusalOf(forges);
    const forge = forges.find((registeredForge) => registeredForge.trackerId === command.trackerId);
    if (forge === undefined) return gaiaRefusalOf('forge-not-registered');
    const reading = readingOf(command.trackerId);
    switch (command.kind) {
      case 'forge-start':
        return ProgramVerdictUtil.verdictOfProgram(await forgeProgram.start(programTargetOf(forge)), (answer) => (answer.started ? 'done' : 'nothing-to-do'));
      case 'forge-stop':
        return stop(forge, reading, command.agents);
      case 'forge-pause':
        return carryOverApi(forge, reading, { kind: 'overseer-pause' });
      case 'forge-resume':
        return carryOverApi(forge, reading, { kind: 'overseer-resume' });
      case 'forge-restart':
        return carryOverApi(forge, reading, { kind: 'overseer-restart', now: false });
      case 'forge-concurrency-set':
        return carryOverApi(forge, reading, { kind: 'concurrency-set', limit: command.limit });
      case 'forge-update':
        return ProgramVerdictUtil.verdictOfUpdate(await forgeProgram.update(programTargetOf(forge)));
      case 'forge-open-in-browser':
        return ProgramVerdictUtil.verdictOfProgram(forgeProgram.openInBrowser(programTargetOf(forge)), () => 'done');
      case 'forge-hide':
        return verdictOfSettingsUpdate(await settingsStore.update(hiding(command.trackerId)));
      case 'forge-brain-start':
        return carryBrainCommand(forge, reading, { kind: 'flint-brain-start' });
      case 'forge-brain-stop':
        return carryBrainCommand(forge, reading, { kind: 'flint-brain-stop' });
    }
  }

  async function carryNow(command: GaiaCommand): Promise<CommandVerdict> {
    switch (command.kind) {
      case 'fleet-look-again':
        await options.lookAgain();
        return { verdict: 'done' };
      case 'forge-add':
        return add(command.root, command.project);
      case 'machine-agent-limit-set':
        return setMachineLimit(command.limit);
      case 'settings-set':
        if (command.change.key === 'startForgesAtLogin') return setStartForgesAtLogin(command.change.value);
        return verdictOfSettingsUpdate(await settingsStore.update(changing(command.change)));
      case 'path-choose':
        return verdictOfPathChoice(await options.pathChooser.choose(command.what));
      default:
        return carryForForge(command);
    }
  }

  async function carry(command: GaiaCommand): Promise<CommandVerdict> {
    const subject = subjectOf(command);
    if (subject === null) return carryNow(command);
    if (subjectsWithCommandInFlight.has(subject)) return gaiaRefusalOf('command-in-flight');
    subjectsWithCommandInFlight.add(subject);
    try {
      return await carryNow(command);
    } finally {
      subjectsWithCommandInFlight.delete(subject);
    }
  }

  return { carry };
}
