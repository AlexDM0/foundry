import type { WorkerProfile } from './WorkerProfile.ts';

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * `confined`: the session runs confined or not at all, by its agent's own sandbox where the adapter applies the profile, else by forge's.
 * `unconfined-by-design`: the session runs with no sandbox.
 */
export type AgentConfinement = 'confined' | 'unconfined-by-design';

/** `subscription` bills the vendor login; `api` bills the API key of Talos's own environment, with an optional cap per launch. */
export type AgentBilling =
  | { readonly mode: 'subscription' }
  | { readonly mode: 'api'; readonly maxBudgetUsd?: number };

export interface AgentLaunchRequest {
  /** The absolute path `programPathOf` answered, which the plan's argv starts with. */
  readonly programPath:          string;
  readonly sessionId:            string;
  /** Continue the session `sessionId` names instead of starting it. */
  readonly resume:               boolean;
  readonly workingDirectory:     string;
  /** The user's home folder, given here because the child's environment may name none. */
  readonly homeDirectory:        string;
  readonly firstMessage:         string;
  readonly roleBrief:            string;
  readonly model:                string;
  readonly effort:               AgentEffort;
  /** The whole child environment, already narrowed to an allowlist (`launchEnvironmentOf`): nothing is inherited. */
  readonly environment:          Readonly<Record<string, string>>;
  readonly profile:              WorkerProfile;
  readonly confinement:          AgentConfinement;
  /** Where the plan's files go; every rendered path the plan names lies in it. */
  readonly launchFilesDirectory: string;
  /** Null for a session that ends without a report. */
  readonly reportSchema:         object | null;
  /** Absent bills by subscription. */
  readonly billing?:             AgentBilling;
}
