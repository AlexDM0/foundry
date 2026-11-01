import type { WorkerProfile } from './WorkerProfile.ts';

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentLaunchRequest {
  /** The absolute path `programPathOf` answered, which the plan's argv starts with. */
  readonly programPath:       string;
  readonly sessionId:         string;
  /** Continue the session `sessionId` names instead of starting it. */
  readonly resume:            boolean;
  readonly workingDirectory:  string;
  /** The user's home folder, given here because the child's environment may name none. */
  readonly homeDirectory:     string;
  readonly firstMessage:      string;
  readonly roleBrief:         string;
  readonly model:             string;
  readonly effort:            AgentEffort;
  /** The whole child environment, already narrowed to an allowlist (`launchEnvironmentOf`): nothing is inherited. */
  readonly environment:       Readonly<Record<string, string>>;
  readonly profile:           WorkerProfile;
  /** Where the plan's files go; every rendered path the plan names lies in it. */
  readonly jobFilesDirectory: string;
  /** Null for a session that ends without a report. */
  readonly reportSchema:      object | null;
}
