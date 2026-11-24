/**
 * The agent choice's model, pure, for the setup's agent step and the forge's settings alike: the vendor cards from the vendors the forge
 * knows (one it cannot run yet is shown, never chosen), this machine's program or the one forge found where installers put it, the
 * program's run as forge reports it, where forge looked, and the commands of each choice. A program chosen for every forge is kept as this
 * machine's first and then followed; Gaia names no vendor of its own and words every card from what the forge sends.
 */
import { PAGE_CONTRACT_VERSIONS }                                                               from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardAgentDocument, BoardAgentProgramChoiceDocument, BoardPipelineAgentDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                                            from '../../../../@types/board/BoardCommandDocument.ts';

const COMMAND_VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

/** The setup record's agent while a setup is open, else the forge's stored one. */
export type AgentChoiceTarget = { readonly kind: 'setup'; readonly setupId: string } | { readonly kind: 'forge' };

export type VendorCardTag = { readonly text: string; readonly tone: 'neutral' | 'warn' };

export interface VendorCard {
  /** `null` for the card that stands for the agents forge does not name yet. */
  readonly vendor:      string | null;
  readonly label:       string;
  readonly description: string;
  readonly selectable:  boolean;
  readonly tag:         VendorCardTag;
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

const COMING_LATER: VendorCardTag = { text: 'Coming later', tone: 'neutral' };

/** Stands for the agents forge will run, while the forge names none of them itself. */
const LATER_AGENTS_CARD: VendorCard = {
  vendor:      null,
  label:       'More coding agents',
  description: 'Forge runs more coding agents in a later version.',
  selectable:  false,
  tag:         COMING_LATER,
};

function machineProgramOf(agent: BoardAgentDocument): MachineProgram | null {
  if (agent.machineProgramPath !== null) return { path: agent.machineProgramPath, isKept: true };
  const found = agent.places.find((place) => place.found);
  return found === undefined ? null : { path: found.path, isKept: false };
}

function vendorCardsOf(agent: BoardAgentDocument): readonly VendorCard[] {
  const programIsKnown = machineProgramOf(agent) !== null || agent.programPath !== null;
  const cards = agent.vendors.map((vendor): VendorCard => (vendor.supported
    ? {
      vendor:      vendor.vendor,
      label:       vendor.displayName,
      description: 'Runs every job of this forge.',
      selectable:  true,
      tag:         programIsKnown ? { text: 'Found', tone: 'neutral' } : { text: 'Not found', tone: 'warn' },
    }
    : {
      vendor: vendor.vendor, label: vendor.displayName, description: 'Forge runs it in a later version.', selectable: false, tag: COMING_LATER
    }));
  return agent.vendors.some((vendor) => !vendor.supported) ? cards : [...cards, LATER_AGENTS_CARD];
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
  return target.kind === 'setup'
    ? {
      ...COMMAND_VERSION, kind: 'pipeline-setup-agent', setupId: target.setupId, agent
    }
    : { ...COMMAND_VERSION, kind: 'pipeline-agent-set', agent };
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

/** A program is kept for every forge by default only while the machine names none: changing the machine's program is a deliberate act. */
function forEveryForgeByDefault(agent: BoardAgentDocument): boolean {
  return agent.machineProgramPath === null;
}

/** Changing a program the machine already names, while other forges follow it, asks first. */
function machineChangeAsksFirst(agent: BoardAgentDocument, forEveryForge: boolean): boolean {
  return forEveryForge && agent.machineProgramPath !== null && agent.otherForgesFollowingMachine > 0;
}

function machineChangeQuestionOf(agent: BoardAgentDocument, displayName: string): string {
  const count = agent.otherForgesFollowingMachine;
  const followers = count === 1 ? '1 other forge follows' : `${count} other forges follow`;
  return `${followers} this machine's ${displayName}. Change it for every one of them?`;
}

/** The agent step's Continue, once the record holds an agent whose program runs; `null` before. */
function continueCommandOf(setupId: string, recordAgent: BoardPipelineAgentDocument | null, agent: BoardAgentDocument): BoardCommandDocument | null {
  if (recordAgent === null || agent.check?.verdict !== 'runs') return null;
  return {
    ...COMMAND_VERSION, kind: 'pipeline-setup-step', setupId, step: 'agent', move: 'continue'
  };
}

function lookAgainCommand(): BoardCommandDocument {
  return { ...COMMAND_VERSION, kind: 'agent-look-again' };
}

/** "Example Agent · /Users/example/.local/bin/agent", or that no program is named yet. */
function footerTextOf(displayName: string, programPath: string | null): string {
  return programPath === null ? `No ${displayName} program yet` : `${displayName} · ${programPath}`;
}

export const AgentChoiceModel = Object.freeze({
  vendorCardsOf,
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
  forEveryForgeByDefault,
  machineChangeAsksFirst,
  machineChangeQuestionOf,
  continueCommandOf,
  lookAgainCommand,
  footerTextOf,
});
