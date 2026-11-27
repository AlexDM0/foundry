/**
 * The agent choice's model, pure, for the setup's agent step and the forge's settings alike: a vendor card for each vendor the forge can
 * run and one line naming those it cannot run yet, this machine's program or the one forge found where installers put it, the program's
 * run as forge reports it, where forge looked, and the commands of each choice. A program chosen for every forge is kept as this machine's
 * first and then followed; Gaia names no vendor of its own and words every card and line from what the forge sends.
 */
import { PAGE_CONTRACT_VERSIONS }                                                               from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardAgentDocument, BoardAgentProgramChoiceDocument, BoardPipelineAgentDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                                            from '../../../../@types/board/BoardCommandDocument.ts';
import { CountTextUtil }                                                                        from '../../../../shared/utils/CountTextUtil.ts';
import type { CommandWaitExplanation }                                                          from '../../../shared/commands/CommandWait.ts';

const COMMAND_VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

type MachineProgramCommand = Extract<BoardCommandDocument, { readonly kind: 'machine-agent-program-set' }>;

/** The setup record's agent while a setup is open, the start of a setup on its landing, else the forge's stored one. */
export type AgentChoiceTarget =
  | { readonly kind: 'setup'; readonly setupId: string }
  | { readonly kind: 'start'; readonly replacesUnreadablePipeline: boolean }
  | { readonly kind: 'forge' };

export interface VendorCard {
  readonly vendor:         string;
  readonly label:          string;
  readonly description:    string;
  /** Whether forge knows a program of the vendor on this machine: "Found", else "Not found". */
  readonly programIsFound: boolean;
}

/** This machine's program of the vendor: the one kept for every forge, else the first one forge found where installers put it. */
export interface MachineProgram {
  readonly path:   string;
  readonly isKept: boolean;
}

export type ProgramStatus = { readonly runs: true; readonly text: string } | { readonly runs: false; readonly text: string };

export interface PlaceRow {
  readonly path:  string;
  readonly found: boolean;
  readonly word:  string;
}

function machineProgramOf(agent: BoardAgentDocument): MachineProgram | null {
  if (agent.machineProgramPath !== null) return { path: agent.machineProgramPath, isKept: true };
  const found = agent.places.find((place) => place.found);
  return found === undefined ? null : { path: found.path, isKept: false };
}

function vendorCardsOf(agent: BoardAgentDocument): readonly VendorCard[] {
  const programIsFound = machineProgramOf(agent) !== null || agent.programPath !== null;
  return agent.vendors
    .filter((vendor) => vendor.supported)
    .map((vendor) => ({
      vendor: vendor.vendor, label: vendor.displayName, description: 'Runs every job of this forge.', programIsFound
    }));
}

/** "A and B come in a later version of forge.": the vendors the forge names and cannot run yet; `null` when there are none. */
function laterVendorsTextOf(agent: BoardAgentDocument): string | null {
  const names = agent.vendors.filter((vendor) => !vendor.supported).map((vendor) => vendor.displayName);
  const lastName = names.at(-1);
  if (lastName === undefined) return null;
  if (names.length === 1) return `${lastName} comes in a later version of forge.`;
  return `${names.slice(0, -1).join(', ')} and ${lastName} come in a later version of forge.`;
}

/** The vendor shown chosen: the choice's, else the first one the forge can run. */
function chosenVendorOf(agent: BoardAgentDocument, choice: BoardPipelineAgentDocument | null): string | null {
  return choice?.vendor ?? agent.vendors.find((vendor) => vendor.supported)?.vendor ?? null;
}

function displayNameOf(agent: BoardAgentDocument, vendor: string | null): string {
  return agent.vendors.find((known) => known.vendor === vendor)?.displayName ?? 'agent';
}

function programChoiceKindOf(choice: BoardPipelineAgentDocument | null): 'machine' | 'pinned' | null {
  if (choice === null) return null;
  return 'pinned' in choice.program ? 'pinned' : 'machine';
}

function pinnedPathOf(choice: BoardPipelineAgentDocument | null): string | null {
  return choice !== null && 'pinned' in choice.program ? choice.program.pinned : null;
}

/** Whether the chosen program runs, as forge ran it: "runs · 2.1.327", or forge's own words of why not; `null` while nothing was run. */
function programStatusOf(agent: BoardAgentDocument, choice: BoardPipelineAgentDocument | null): ProgramStatus | null {
  if (choice === null || agent.check === null) return null;
  return agent.check.verdict === 'runs' ? { runs: true, text: `runs · ${agent.check.version}` } : { runs: false, text: agent.check.text };
}

function placeRowsOf(agent: BoardAgentDocument): readonly PlaceRow[] {
  return agent.places.map((place) => ({
    path:  place.path,
    found: place.found,
    word:  place.found ? (place.path === agent.programPath ? 'in use' : 'found') : 'not there',
  }));
}

function agentCommandOf(target: AgentChoiceTarget, vendor: string, program: BoardAgentProgramChoiceDocument): BoardCommandDocument {
  const agent = { vendor, program };
  switch (target.kind) {
    case 'setup':
      return {
        ...COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: target.setupId, agent
      };
    case 'start':
      return {
        ...COMMAND_VERSION, kind: 'pipeline-setup-start', agent, replacesUnreadablePipeline: target.replacesUnreadablePipeline
      };
    case 'forge':
      return { ...COMMAND_VERSION, kind: 'pipeline-agent-set', agent };
  }
}

function machineProgramCommandOf(vendor: string, programPath: string): BoardCommandDocument {
  return {
    ...COMMAND_VERSION, kind: 'machine-agent-program-set', vendor, programPath
  };
}

/** Follows this machine's program, keeping the one forge found as this machine's first when the machine names none yet. */
function machineChoiceCommandsOf(target: AgentChoiceTarget, vendor: string, machineProgram: MachineProgram): readonly BoardCommandDocument[] {
  const follow = agentCommandOf(target, vendor, { follows: 'machine' });
  return machineProgram.isKept ? [follow] : [machineProgramCommandOf(vendor, machineProgram.path), follow];
}

/** A chosen program: kept as this machine's and followed, or pinned to this forge alone. */
function chosenProgramCommandsOf(target: AgentChoiceTarget, vendor: string, programPath: string, forEveryForge: boolean): readonly BoardCommandDocument[] {
  if (!forEveryForge) return [agentCommandOf(target, vendor, { pinned: programPath })];
  return [machineProgramCommandOf(vendor, programPath), agentCommandOf(target, vendor, { follows: 'machine' })];
}

/**
 * A refusal part-way through a choice for every forge: the machine's program forge stored before it refused the forge's choice, said so the
 * page stays honest about what changed; `null` when nothing was stored first. The machine's program goes first since forge checks it there,
 * and a forge cannot follow a machine program that is not stored yet.
 */
function storedBeforeRefusalTextOf(appliedCommands: readonly BoardCommandDocument[], displayName: string): string | null {
  const stored = appliedCommands.find((command): command is MachineProgramCommand => command.kind === 'machine-agent-program-set');
  return stored === undefined ? null : `This machine's ${displayName} is now ${stored.programPath}, but this forge's agent did not change.`;
}

/** A program is kept for every forge by default only while the machine names none: changing the machine's program is a deliberate act. */
function forEveryForgeByDefault(agent: BoardAgentDocument): boolean {
  return agent.machineProgramPath === null;
}

/** Changing a program the machine already names asks first while other forges follow it, or while Gaia does not know whether any do. */
function machineChangeAsksFirst(agent: BoardAgentDocument, forEveryForge: boolean): boolean {
  const count = agent.otherForgesFollowingMachine;
  return forEveryForge && agent.machineProgramPath !== null && (count === null || count > 0);
}

/** "3 other forges follow", or `null` while Gaia has not read every other forge. */
function followersTextOf(count: number | null): string | null {
  if (count === null) return null;
  return CountTextUtil.countedPhrase(count, 'other forge follows', 'other forges follow');
}

function machineChangeQuestionOf(agent: BoardAgentDocument, displayName: string): string {
  const followers = followersTextOf(agent.otherForgesFollowingMachine);
  if (followers === null) {
    return `Other forges may follow this machine's ${displayName}: Gaia could not read every forge now. Change it for every one that follows it?`;
  }
  return `${followers} this machine's ${displayName}. Change it for every one of them?`;
}

/**
 * The landing's start, with the program held on the page: the one chosen in the file chooser, else this machine's; `null` while neither is
 * there, or the forge knows no vendor it can run.
 */
function startCommandsOf(
  agent: BoardAgentDocument,
  programChoice: { readonly chosenPath: string | null; readonly forEveryForge: boolean },
  replacesUnreadablePipeline: boolean
): readonly BoardCommandDocument[] | null {
  const vendor = chosenVendorOf(agent, null);
  if (vendor === null) return null;
  const target = { kind: 'start', replacesUnreadablePipeline } as const;
  if (programChoice.chosenPath !== null) return chosenProgramCommandsOf(target, vendor, programChoice.chosenPath, programChoice.forEveryForge);
  const machineProgram = machineProgramOf(agent);
  return machineProgram === null ? null : machineChoiceCommandsOf(target, vendor, machineProgram);
}

/** The agent step's Continue, once the record holds an agent whose program runs; `null` before. */
function continueCommandOf(setupId: string, recordAgent: BoardPipelineAgentDocument | null, agent: BoardAgentDocument): BoardCommandDocument | null {
  if (recordAgent === null || agent.check?.verdict !== 'runs') return null;
  return {
    ...COMMAND_VERSION, kind: 'pipeline-setup-step', setupId, step: 'agent', move: 'continue'
  };
}

/** What the panel over the page says while forge runs the agent's program once before it answers, and what it does once the program ran. */
function programCheckWaitOf(displayName: string, afterwards: string): CommandWaitExplanation {
  return {
    title:       `Checking ${displayName}`,
    explanation: `Forge starts the ${displayName} program once to check that it runs on this machine, then ${afterwards}.`,
  };
}

/** What the panel over the page says while Look again runs the agent's program. */
const LOOK_AGAIN_WAIT: CommandWaitExplanation = Object.freeze({
  title:       'Looking again',
  explanation: 'Forge starts the agent\'s program once to check that it runs on this machine. Once it runs, forge launches every job that stood not launched.',
});

function lookAgainCommand(): BoardCommandDocument {
  return { ...COMMAND_VERSION, kind: 'agent-look-again' };
}

export const AgentChoiceModel = Object.freeze({
  vendorCardsOf,
  laterVendorsTextOf,
  chosenVendorOf,
  displayNameOf,
  machineProgramOf,
  programChoiceKindOf,
  pinnedPathOf,
  programStatusOf,
  placeRowsOf,
  agentCommandOf,
  machineChoiceCommandsOf,
  chosenProgramCommandsOf,
  storedBeforeRefusalTextOf,
  forEveryForgeByDefault,
  machineChangeAsksFirst,
  machineChangeQuestionOf,
  followersTextOf,
  startCommandsOf,
  continueCommandOf,
  lookAgainCommand,
  programCheckWaitOf,
  lookAgainWait: LOOK_AGAIN_WAIT,
});
