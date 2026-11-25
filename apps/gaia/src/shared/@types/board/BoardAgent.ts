/**
 * A forge's agent as Gaia holds it: the vendors the forge knows, the forge's choice of agent and program, this machine's program of that
 * vendor, whether the program runs, where its installers put it, and the tools an agent's search path holds. Values only: the forge words
 * why a program does not run.
 */
import type { BoardAgentProgramRefusalCause, BoardAgentToolUseKind, BoardBillingMode } from './BoardVocabulary.ts';

/** One way a vendor's agent bills: `keyVariableName` is the environment variable that must hold the key, `null` for the login mode. */
export interface BoardAgentBillingOption {
  readonly mode:            BoardBillingMode;
  readonly keyVariableName: string | null;
  /** Whether a launch takes the billing's cap. */
  readonly capsEachLaunch:  boolean;
}

export interface BoardAgentVendor {
  readonly vendor:         string;
  readonly displayName:    string;
  readonly supported:      boolean;
  /** Its default first; empty for a vendor the forge cannot run. */
  readonly billingOptions: readonly BoardAgentBillingOption[];
}

/** The machine's program of the vendor, or a path for this forge alone, kept as found. */
export type BoardAgentProgramChoice = { readonly follows: 'machine' } | { readonly pinned: string };

export interface BoardPipelineAgent {
  readonly vendor:  string;
  readonly program: BoardAgentProgramChoice;
}

export interface BoardPipelineTool {
  readonly name: string;
  readonly path: string;
}

/** A tool as a command names it: `null` for a path forge finds. */
export interface BoardToolRequest {
  readonly name: string;
  readonly path: string | null;
}

export interface BoardAgentProgramPlace {
  readonly path:  string;
  readonly found: boolean;
}

export type BoardAgentProgramCheck =
  | { readonly verdict: 'runs'; readonly version: string }
  | { readonly verdict: 'does-not-run'; readonly cause: BoardAgentProgramRefusalCause; readonly sentence: string };

/** `name` and `entity` are `null` for a tool every job runs. */
export interface BoardAgentToolUse {
  readonly kind:   BoardAgentToolUseKind;
  readonly name:   string | null;
  readonly entity: string | null;
}

export interface BoardAgentTool {
  readonly name:     string;
  /** `null` while the machine lacks it. */
  readonly path:     string | null;
  readonly approved: boolean;
  readonly usedBy:   readonly BoardAgentToolUse[];
}

export interface BoardAgent {
  readonly vendors:            readonly BoardAgentVendor[];
  readonly choice:             BoardPipelineAgent | null;
  readonly machineProgramPath: string | null;
  readonly programPath:        string | null;
  readonly check:              BoardAgentProgramCheck | null;
  readonly places:             readonly BoardAgentProgramPlace[];
  /** `false` while the tools follow the pipeline's programs. */
  readonly toolsListed:        boolean;
  readonly tools:              readonly BoardAgentTool[];
}

export interface BoardJobNotLaunched {
  readonly cause:       BoardAgentProgramRefusalCause;
  readonly programPath: string | null;
  readonly sentence:    string;
}
