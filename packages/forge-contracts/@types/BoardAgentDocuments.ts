/**
 * The board document's agent: the agent vendors this forge runs, the forge's choice of its agent and program, this machine's program of
 * that vendor, the places its installers put it, whether the program runs, and the tools whose folders an agent's search path holds.
 */

/** How a session of a vendor's agent can be billed: by the vendor's login, or by the account of a key in Hephaestus's environment. */
export type AgentBillingModeDocument = 'subscription' | 'api';

/** One way a vendor's agent bills, with what it means: the variable its key must be in, and whether each launch takes a cap. */
export interface AgentBillingOptionDocument {
  readonly mode:            AgentBillingModeDocument;
  /** The environment variable that must hold the key before any session starts; `null` for a mode that bills the login. */
  readonly keyVariableName: string | null;
  /** Whether the agent caps each launch of a session at the billing's `maxBudgetUsd`. */
  readonly capsEachLaunch:  boolean;
}

/** A vendor of coding agents this forge knows, with whether this forge can run it now. */
export interface AgentVendorDocument {
  readonly vendor:         string;
  /** The agent's name as a person knows it. */
  readonly displayName:    string;
  readonly supported:      boolean;
  /** The ways this vendor's agent bills, its default first; empty for a vendor this forge cannot run. From forge 4.3. */
  readonly billingOptions: readonly AgentBillingOptionDocument[];
}

/** How a forge names its agent's program: the machine's program of its vendor, or a path for this forge alone, kept as found. */
export type AgentProgramChoiceDocument = { readonly follows: 'machine' } | { readonly pinned: string };

/** The agent every job of a forge runs: its vendor and the program that vendor's sessions start. */
export interface PipelineAgentDocument {
  readonly vendor:  string;
  readonly program: AgentProgramChoiceDocument;
}

/** A program the forge's agents may run, by its name and the absolute path it was found at, kept as found. */
export interface PipelineToolDocument {
  readonly name: string;
  readonly path: string;
}

/** A tool as a command names it: with its path, or by its name alone, which forge then finds in the places installers put programs. */
export interface PipelineToolRequestDocument {
  readonly name:  string;
  readonly path?: string;
}

/** Where a vendor's installers put its program, and whether a program is there now. */
export interface AgentProgramPlaceDocument {
  readonly path:  string;
  readonly found: boolean;
}

/**
 * Why an agent's program does not run: `no-agent-chosen`, `other-vendor`, `no-machine-program` and `billing-not-offered` (the billing
 * names a way the vendor does not bill, from forge 4.3) read the choice; `relative-path`,
 * `inside-forbidden-root`, `batch-target`, `not-there`, `not-executable` and `no-adapter` where the program lies; `did-not-start`,
 * `timed-out`, `failed` and `not-this-agent` how its run with its version arguments ended.
 */
export type AgentProgramRefusalCause =
  | 'no-agent-chosen'
  | 'other-vendor'
  | 'no-machine-program'
  | 'billing-not-offered'
  | 'relative-path'
  | 'inside-forbidden-root'
  | 'batch-target'
  | 'not-there'
  | 'not-executable'
  | 'no-adapter'
  | 'did-not-start'
  | 'timed-out'
  | 'failed'
  | 'not-this-agent';

/** The program's one run with its version arguments: it runs, with the version it answered, or why it does not, worded. */
export type AgentProgramCheckDocument =
  | { readonly verdict: 'runs'; readonly version: string }
  | { readonly verdict: 'does-not-run'; readonly cause: AgentProgramRefusalCause; readonly sentence: string };

/** Where a pipeline runs a tool: a prepare step or a gate, of an entity or of the forge; git is run by every job. */
export type AgentToolUseDocument =
  | { readonly kind: 'prepare' | 'gate'; readonly name: string; readonly entity: string | null }
  | { readonly kind: 'every-job' };

/** One tool as a view lists it: where it was found, `null` when the machine lacks it, whether the forge's list holds it, and its uses. */
export interface AgentToolDocument {
  readonly name:     string;
  readonly path:     string | null;
  readonly approved: boolean;
  readonly usedBy:   readonly AgentToolUseDocument[];
}

export interface BoardAgentDocument {
  /** Every vendor this forge knows; only a supported one can be chosen. */
  readonly vendors:            readonly AgentVendorDocument[];
  /** The forge's choice, the open setup record's while no pipeline is stored; `null` while none is chosen. */
  readonly choice:             PipelineAgentDocument | null;
  /** This machine's program of the chosen vendor, else of this forge's own; `null` when the machine names none. */
  readonly machineProgramPath: string | null;
  /** The program a launch starts now; `null` when the choice names none. */
  readonly programPath:        string | null;
  /** `null` while the program was not run since this forge started, or no program is named. */
  readonly check:              AgentProgramCheckDocument | null;
  /** Where the installers of the chosen vendor, else of this forge's own, put its program, each as found. */
  readonly places:             readonly AgentProgramPlaceDocument[];
  /** `true` while the forge keeps its own list; `false` while its tools follow the pipeline's programs. */
  readonly toolsListed:        boolean;
  /** The stored pipeline's tools, git first. */
  readonly tools:              readonly AgentToolDocument[];
}
