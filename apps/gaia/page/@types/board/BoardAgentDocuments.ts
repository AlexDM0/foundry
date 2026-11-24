/**
 * The page's board contract for a forge's agent: the vendors the forge knows, the forge's choice of agent and program, this machine's
 * program of that vendor, whether the program runs, where its installers put it, the tools an agent's search path holds, and how many other
 * forges follow this machine's program, which Gaia counts across its forges.
 */
import type { BoardAgentProgramRefusalCause, BoardAgentToolUseKind } from './BoardVocabulary.ts';

export interface BoardAgentVendorDocument {
  readonly vendor:      string;
  readonly displayName: string;
  readonly supported:   boolean;
}

/** The machine's program of the vendor, or a path for this forge alone, kept as found. */
export type BoardAgentProgramChoiceDocument = { readonly follows: 'machine' } | { readonly pinned: string };

export interface BoardPipelineAgentDocument {
  readonly vendor:  string;
  readonly program: BoardAgentProgramChoiceDocument;
}

export interface BoardPipelineToolDocument {
  readonly name: string;
  readonly path: string;
}

/** A tool as a command names it: `null` for a path forge finds. */
export interface BoardToolRequestDocument {
  readonly name: string;
  readonly path: string | null;
}

export interface BoardAgentProgramPlaceDocument {
  readonly path:  string;
  readonly found: boolean;
}

export type BoardAgentProgramCheckDocument =
  | { readonly verdict: 'runs'; readonly version: string }
  | { readonly verdict: 'does-not-run'; readonly cause: BoardAgentProgramRefusalCause; readonly text: string };

/** `name` and `entity` are `null` for a tool every job runs. */
export interface BoardAgentToolUseDocument {
  readonly kind:   BoardAgentToolUseKind;
  readonly name:   string | null;
  readonly entity: string | null;
}

export interface BoardAgentToolDocument {
  readonly name:     string;
  /** `null` while the machine lacks it. */
  readonly path:     string | null;
  readonly approved: boolean;
  readonly usedBy:   readonly BoardAgentToolUseDocument[];
}

export interface BoardAgentDocument {
  readonly vendors:                     readonly BoardAgentVendorDocument[];
  readonly choice:                      BoardPipelineAgentDocument | null;
  readonly machineProgramPath:          string | null;
  readonly programPath:                 string | null;
  readonly check:                       BoardAgentProgramCheckDocument | null;
  readonly places:                      readonly BoardAgentProgramPlaceDocument[];
  /** `false` while the tools follow the pipeline's programs. */
  readonly toolsListed:                 boolean;
  readonly tools:                       readonly BoardAgentToolDocument[];
  /** The other forges of this machine whose agent follows this machine's program of the vendor. */
  readonly otherForgesFollowingMachine: number;
}

export interface BoardJobNotLaunchedDocument {
  readonly cause:       BoardAgentProgramRefusalCause;
  readonly programPath: string | null;
  readonly text:        string;
}
