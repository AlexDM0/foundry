/** The facts of a forge's agent a view reads: the vendors, the choice, the machine's program, where it lies, whether it runs, and the tools. */
import type { AgentBillingOption } from '../../lib/agent-launch/AgentAdapter.ts';
import type { PipelineAgent }      from '../../lib/tracker-model/@types/Pipeline.ts';
import type { AgentProgramCheck }  from './AgentProgramCheck.ts';

/** Where a pipeline runs a tool: a prepare step or a gate, of an entity or of the forge; git is run by every job. */
export type ToolUse =
  | { kind: 'prepare' | 'gate'; name: string; entity: string | null }
  | { kind: 'every-job' };

/** One tool as a view lists it: where it was found, `null` when the machine lacks it, whether the forge's list holds it, and its uses. */
export interface ToolFacts {
  name:     string;
  path:     string | null;
  approved: boolean;
  usedBy:   ToolUse[];
}

/** Where a vendor's installers put its program, and whether a program is there. */
export interface AgentProgramPlace {
  path:  string;
  found: boolean;
}

export interface AgentVendor {
  vendor:         string;
  displayName:    string;
  supported:      boolean;
  /** The ways the vendor's agent bills, its default first; none for a vendor no adapter here runs. */
  billingOptions: readonly AgentBillingOption[];
}

export interface AgentFacts {
  vendors:            AgentVendor[];
  /** The agent's name as a person knows it, which every sentence about its program names. */
  agentName:          string;
  choice:             PipelineAgent | null;
  machineProgramPath: string | null;
  programPath:        string | null;
  /** `null` while the program was not run since Hephaestus started, or no program is named. */
  check:              AgentProgramCheck | null;
  places:             AgentProgramPlace[];
  toolsListed:        boolean;
  tools:              ToolFacts[];
  /** The open setup record's tools, of its draft or else of the stored pipeline; empty with no record open. */
  setupTools:         ToolFacts[];
}
