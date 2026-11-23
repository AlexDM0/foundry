/**
 * Carries out one command (`docs/architecture.md`, "A command, from button to forge") and answers a verdict, never a throw. The forge's API
 * carries what a Hephaestus does while it answers and its control contract is known; the forge program carries the rest; Gaia's settings
 * carry what is Gaia's own. One command per forge, per repository being added, for the machine limit and for the chooser is on its way at a
 * time.
 */
import type { ForgeControlCommand } from 'forge-contracts/ForgeControlCommand';

import { HephaestusTokenFile }                                       from '../../adapters/forge-api/HephaestusTokenFile.ts';
import type { ForgeProgram, ForgeProgramTarget }                     from '../../adapters/forge-program/ForgeProgram.ts';
import type { RegisteredForge, RegisteredHephaestus }                from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { registeredForgesOf, type RegistryReading }                  from '../../adapters/forge-registry/RegistryFile.ts';
import type { PathChoiceVerdict }                                    from '../../adapters/path-chooser/@types/PathChoiceVerdict.ts';
import type { PathChooser }                                          from '../../adapters/path-chooser/PathChooser.ts';
import type { ForgeCommandAnswer, HephaestusAccess }                 from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                                          from '../../lib/forge-client/ForgeClient.ts';
import type { SettingsStore, SettingsUpdate, SettingsUpdateVerdict } from '../../services/SettingsStore.ts';
import type { CommandVerdict, GaiaRefusal, RegistryRefusal }         from '../../shared/@types/CommandVerdict.ts';
import type { ForgeReading }                                         from '../../shared/@types/ForgeReading.ts';
import type {
  ForgeCommand,
  ForgeStopAgents,
  GaiaCommand,
  SettingsChange,
} from '../../shared/@types/GaiaCommand.ts';
import type { GaiaSettings }              from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }              from '../../shared/constants/ContractVersions.ts';
import { HEPHAESTUS_ANSWERED_FIDELITIES } from '../../shared/constants/ForgeFidelities.ts';

import { OutageResume, type OutageResumeForge } from './OutageResume.ts';
import { ProgramVerdictUtil }                   from './utils/ProgramVerdictUtil.ts';

export interface ForgeControlOptions {
  /** Read at each command, so the program and Hephaestus's token file are the ones the registry names now. */
  readonly readRegistry:    () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether a Hephaestus answers and which control contract it speaks. */
  readonly readings:        () => readonly ForgeReading[];
  readonly forgeClient:     ForgeClient;
  readonly forgeProgram:    ForgeProgram;
  readonly settingsStore:   Pick<SettingsStore, 'settings' | 'fileState' | 'update'>;
  readonly pathChooser:     PathChooser;
  /** A registry read and an identity round at once. */
  readonly lookAgain:       () => Promise<void>;
  /** The forge's jobs a network outage stopped, as Gaia last read its presence; the count its resume answers. */
  readonly outageEndingsOf: (trackerId: string) => number;
}

export interface ForgeControl {
  readonly carry: (command: GaiaCommand) => Promise<CommandVerdict>;
}

/** The machine limit and the chooser are one each, whatever the forge; a forge and a repository being added are named. */
const MACHINE_LIMIT_SUBJECT = 'machine-limit';
const PATH_CHOOSER_SUBJECT = 'path-chooser';
const OUTAGE_RESUME_SUBJECT = 'outage-resume';

/**
 * `api`: Hephaestus answers and speaks the control contract Gaia sends, at any minor. `control-unknown`: it answers in another contract
 * or names none. `no-hephaestus`: no Hephaestus answered the last read, or the registry now names another address than the
 * one the watch read, so the contract read is not that Hephaestus's.
 */
type ApiReach =
  | { readonly reach: 'api'; readonly hephaestus: RegisteredHephaestus }
  | { readonly reach: 'control-unknown' }
  | { readonly reach: 'no-hephaestus' };

type ApiReachOverApi = Extract<ApiReach, { readonly reach: 'api' }>;

function gaiaRefusalOf(refusal: GaiaRefusal): CommandVerdict {
  return { verdict: 'refused', refusedBy: 'gaia', refusal };
}

function apiReachOf(forge: RegisteredForge, reading: ForgeReading | null): ApiReach {
  const { hephaestus } = forge;
  if (hephaestus === null || reading === null || reading.url !== hephaestus.url || !HEPHAESTUS_ANSWERED_FIDELITIES.has(reading.fidelity)) return { reach: 'no-hephaestus' };
  if (reading.contracts.control !== CONTRACT_VERSIONS.forgeControl) return { reach: 'control-unknown' };
  return { reach: 'api', hephaestus };
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
function forgeSubjectOf(trackerId: string): string {
  return `forge ${trackerId}`;
}

function subjectOf(command: GaiaCommand): string | null {
  switch (command.kind) {
    case 'fleet-look-again':
      return null;
    case 'fleet-outage-resume':
      return OUTAGE_RESUME_SUBJECT;
    case 'settings-set':
      return null;
    case 'forge-add':
      return `repository ${command.root}`;
    case 'machine-agent-limit-set':
      return MACHINE_LIMIT_SUBJECT;
    case 'path-choose':
      return PATH_CHOOSER_SUBJECT;
    default:
      return forgeSubjectOf(command.trackerId);
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
  async function sendOverApi(apiReach: ApiReachOverApi, controlCommands: readonly ForgeControlCommand[]): Promise<CommandVerdict> {
    const { hephaestus } = apiReach;
    const bearerToken = hephaestus.tokenPath === null ? null : await new HephaestusTokenFile(hephaestus.tokenPath).read();
    if (bearerToken === null) return gaiaRefusalOf('token-unreadable');
    const access: HephaestusAccess = { hephaestusUrl: hephaestus.url, bearerToken };
    let anyCommandChangedSomething = false;
    for (const controlCommand of controlCommands) {
      const answer = await forgeClient.send(access, controlCommand);
      if (answer.verdict !== 'answered') return verdictOfApiFailure(answer);
      if (answer.outcome === 'done') anyCommandChangedSomething = true;
    }
    return { verdict: anyCommandChangedSomething ? 'done' : 'nothing-to-do' };
  }

  /** A command only a running Hephaestus can carry out. */
  async function carryOverApi(forge: RegisteredForge, reading: ForgeReading | null, controlCommand: ForgeControlCommand): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'no-hephaestus') return { verdict: 'unreachable' };
    return sendOverApi(apiReach, [controlCommand]);
  }

  /**
   * The contract check comes before the carrier: a Hephaestus that answers in a control contract Gaia does not know is sent nothing and
   * left running. With no Hephaestus answering, none answering the stop, or no token to send it with, the forge program stops the forge.
   */
  async function stop(forge: RegisteredForge, reading: ForgeReading | null, agents: ForgeStopAgents): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'api') {
      const hephaestusStop: ForgeControlCommand = { kind: 'hephaestus-stop', now: false };
      const controlCommands: readonly ForgeControlCommand[] = agents === 'stop-first' ? [{ kind: 'job-stop-all', mode: 'stop' }, hephaestusStop] : [hephaestusStop];
      const apiVerdict = await sendOverApi(apiReach, controlCommands);
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
      const apiVerdict = await sendOverApi(apiReach, [{ kind: 'machine-agent-limit-set', limit }]);
      if (!apiLeftTheCommandUncarried(apiVerdict)) return apiVerdict;
    }
    const forgeWithItsRepository = forges.find((forge) => readingOf(forge.trackerId)?.fidelity !== 'repository-missing');
    if (forgeWithItsRepository === undefined) return gaiaRefusalOf('no-forge-registered');
    return ProgramVerdictUtil.verdictOfProgram(await forgeProgram.machineLimitSet(programTargetOf(forgeWithItsRepository), limit), (answer) => answer.outcome);
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
        return carryOverApi(forge, reading, { kind: 'hephaestus-pause' });
      case 'forge-unpause':
        return carryOverApi(forge, reading, { kind: 'hephaestus-unpause' });
      case 'forge-interrupted-work-resume':
        return carryOverApi(forge, reading, { kind: 'interrupted-work-resume', target: command.target });
      case 'forge-restart':
        return carryOverApi(forge, reading, { kind: 'hephaestus-restart', now: false });
      case 'forge-talos-restart':
        return carryOverApi(forge, reading, { kind: 'talos-restart' });
      case 'forge-concurrency-set':
        return carryOverApi(forge, reading, { kind: 'concurrency-set', limit: command.limit });
      case 'forge-update':
        return ProgramVerdictUtil.verdictOfUpdate(await forgeProgram.update(programTargetOf(forge)));
      case 'forge-hide':
        return verdictOfSettingsUpdate(await settingsStore.update(hiding(command.trackerId)));
    }
  }

  /** Each forge's resume is held as any command to that forge is, so it never meets a second command to the same forge on its way. */
  async function resumeOutageEndings(): Promise<CommandVerdict> {
    const forges = await registeredForges();
    if (typeof forges === 'string') return gaiaRefusalOf(forges);
    const fleet = forges.map((forge): OutageResumeForge => ({
      trackerId:     forge.trackerId,
      apiAnswers:    apiReachOf(forge, readingOf(forge.trackerId)).reach === 'api',
      outageEndings: options.outageEndingsOf(forge.trackerId),
    }));
    const forgesById = new Map(forges.map((forge) => [forge.trackerId, forge]));
    const answers = await OutageResume.resumeAll(fleet, (trackerId) => withSubjectHeld(forgeSubjectOf(trackerId), () => {
      const forge = forgesById.get(trackerId);
      if (forge === undefined) return Promise.resolve(gaiaRefusalOf('forge-not-registered'));
      return carryOverApi(forge, readingOf(trackerId), { kind: 'interrupted-work-resume', target: 'network-outage' });
    }));
    return { verdict: 'outage-resume-answered', forges: answers };
  }

  async function carryNow(command: GaiaCommand): Promise<CommandVerdict> {
    switch (command.kind) {
      case 'fleet-look-again':
        await options.lookAgain();
        return { verdict: 'done' };
      case 'fleet-outage-resume':
        return resumeOutageEndings();
      case 'forge-add':
        return add(command.root, command.project);
      case 'machine-agent-limit-set':
        return setMachineLimit(command.limit);
      case 'settings-set':
        return verdictOfSettingsUpdate(await settingsStore.update(changing(command.change)));
      case 'path-choose':
        return verdictOfPathChoice(await options.pathChooser.choose(command.what));
      default:
        return carryForForge(command);
    }
  }

  async function withSubjectHeld(subject: string, work: () => Promise<CommandVerdict>): Promise<CommandVerdict> {
    if (subjectsWithCommandInFlight.has(subject)) return gaiaRefusalOf('command-in-flight');
    subjectsWithCommandInFlight.add(subject);
    try {
      return await work();
    } finally {
      subjectsWithCommandInFlight.delete(subject);
    }
  }

  async function carry(command: GaiaCommand): Promise<CommandVerdict> {
    const subject = subjectOf(command);
    if (subject === null) return carryNow(command);
    return withSubjectHeld(subject, () => carryNow(command));
  }

  return { carry };
}
