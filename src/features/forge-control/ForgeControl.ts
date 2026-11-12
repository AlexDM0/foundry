/**
 * Carries out one command on one forge (PLAN 8.2) and answers a verdict, never a throw. The forge's API carries what an Overseer does
 * while it answers and its control contract is known; the forge program carries the rest. One command per forge is on its way at a time.
 */
import { OverseerTokenFile }                               from '../../adapters/forge-api/OverseerTokenFile.ts';
import type { ForgeProgramVerdict }                        from '../../adapters/forge-program/@types/ForgeProgramAnswer.ts';
import type { ForgeProgram, ForgeProgramTarget }           from '../../adapters/forge-program/ForgeProgram.ts';
import type { RegisteredForge, RegisteredOverseer }        from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }                            from '../../adapters/forge-registry/RegistryFile.ts';
import type { ForgeCommandAnswer }                         from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeControlCommand }                        from '../../lib/forge-client/@types/ForgeControlCommand.ts';
import type { ForgeClient }                                from '../../lib/forge-client/ForgeClient.ts';
import type { ForgeFidelity, ForgeReading }                from '../../shared/@types/ForgeReading.ts';
import type { ForgeCommand, ForgeStopAgents, GaiaCommand } from '../../shared/@types/GaiaCommand.ts';
import { CONTRACT_VERSIONS }                               from '../../shared/constants/ContractVersions.ts';
import type { CommandVerdict, GaiaRefusal }                from './@types/CommandVerdict.ts';

export interface ForgeControlOptions {
  /** Read at each command, so the program and the Overseer's token file are the ones the registry names now. */
  readonly readRegistry: () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether an Overseer answers and which control contract it speaks. */
  readonly readings:     () => readonly ForgeReading[];
  readonly forgeClient:  ForgeClient;
  readonly forgeProgram: ForgeProgram;
  /** A registry read and an identity round at once. */
  readonly lookAgain:    () => Promise<void>;
}

export interface ForgeControl {
  readonly carry: (command: GaiaCommand) => Promise<CommandVerdict>;
}

/** The fidelities at which the forge's Overseer answered its last read. */
const OVERSEER_ANSWERS_AT: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>(['full', 'counts-only', 'newer-contract']);

/**
 * `api`: the Overseer answers and speaks the known control contract. `control-unknown`: it answers in another contract or names none.
 * `no-overseer`: no Overseer answered the last read.
 */
type ApiReach = { readonly reach: 'api'; readonly overseer: RegisteredOverseer } | { readonly reach: 'control-unknown' } | { readonly reach: 'no-overseer' };

function gaiaRefusalOf(refusal: GaiaRefusal): CommandVerdict {
  return { verdict: 'refused', refusedBy: 'gaia', refusal };
}

function apiReachOf(forge: RegisteredForge, reading: ForgeReading | null): ApiReach {
  const { overseer } = forge;
  if (overseer === null || reading === null || reading.url === null || !OVERSEER_ANSWERS_AT.has(reading.fidelity)) return { reach: 'no-overseer' };
  return reading.contracts.control === CONTRACT_VERSIONS.forgeControl ? { reach: 'api', overseer } : { reach: 'control-unknown' };
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

function verdictOfProgram<Answer>(programVerdict: ForgeProgramVerdict<Answer>, outcomeOf: (answer: Answer) => 'done' | 'nothing-to-do'): CommandVerdict {
  switch (programVerdict.verdict) {
    case 'done':
      return { verdict: outcomeOf(programVerdict.answer) };
    case 'refused':
      return {
        verdict: 'refused', refusedBy: 'forge', refusal: programVerdict.refusal, text: programVerdict.text,
      };
    case 'program-not-found':
      return gaiaRefusalOf('program-not-found');
    case 'root-missing':
      return gaiaRefusalOf('repository-missing');
    case 'timed-out':
      return { verdict: 'unreachable' };
    case 'answer-not-understood':
      return { verdict: 'not-supported' };
  }
}

export function createForgeControl(options: ForgeControlOptions): ForgeControl {
  const { forgeClient, forgeProgram } = options;
  const forgesWithCommandInFlight = new Set<string>();

  async function registeredForgeOf(trackerId: string): Promise<RegisteredForge | null> {
    const registryReading = await options.readRegistry();
    if (registryReading.verdict !== 'readable') return null;
    return registryReading.forges.find((forge) => forge.trackerId === trackerId) ?? null;
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

  /**
   * The contract check comes before the carrier: an Overseer that answers in a control contract Gaia does not know is sent nothing and
   * left running. With no Overseer answering, or none answering the stop, the forge program stops the forge.
   */
  async function stop(forge: RegisteredForge, reading: ForgeReading | null, target: ForgeProgramTarget, agents: ForgeStopAgents): Promise<CommandVerdict> {
    const apiReach = apiReachOf(forge, reading);
    if (apiReach.reach === 'control-unknown') return { verdict: 'not-supported' };
    if (apiReach.reach === 'api') {
      const overseerStop: ForgeControlCommand = { kind: 'overseer-stop', now: false };
      const controlCommands: readonly ForgeControlCommand[] = agents === 'stop-first' ? [{ kind: 'job-stop-all', mode: 'stop' }, overseerStop] : [overseerStop];
      const apiVerdict = await sendOverApi(apiReach.overseer, controlCommands);
      if (apiVerdict.verdict !== 'unreachable') return apiVerdict;
    }
    return verdictOfProgram(await forgeProgram.stop(target), (answer) => answer.outcome);
  }

  async function carryForForge(command: ForgeCommand): Promise<CommandVerdict> {
    const forge = await registeredForgeOf(command.trackerId);
    if (forge === null) return gaiaRefusalOf('forge-not-registered');
    const reading = readingOf(command.trackerId);
    const target: ForgeProgramTarget = { root: forge.root, program: forge.program };
    switch (command.kind) {
      case 'forge-start':
        return verdictOfProgram(await forgeProgram.start(target), (answer) => (answer.started ? 'done' : 'nothing-to-do'));
      case 'forge-stop':
        return stop(forge, reading, target, command.agents);
      case 'forge-pause':
        return carryOverApi(forge, reading, { kind: 'overseer-pause' });
      case 'forge-resume':
        return carryOverApi(forge, reading, { kind: 'overseer-resume' });
      case 'forge-restart':
        return carryOverApi(forge, reading, { kind: 'overseer-restart', now: false });
      case 'forge-update':
        return verdictOfProgram(await forgeProgram.update(target), (answer) => answer.outcome);
      case 'forge-open-in-browser':
        return verdictOfProgram(forgeProgram.openInBrowser(target), () => 'done');
    }
  }

  async function carry(command: GaiaCommand): Promise<CommandVerdict> {
    if (command.kind === 'fleet-look-again') {
      await options.lookAgain();
      return { verdict: 'done' };
    }
    const { trackerId } = command;
    if (forgesWithCommandInFlight.has(trackerId)) return gaiaRefusalOf('command-in-flight');
    forgesWithCommandInFlight.add(trackerId);
    try {
      return await carryForForge(command);
    } finally {
      forgesWithCommandInFlight.delete(trackerId);
    }
  }

  return { carry };
}
