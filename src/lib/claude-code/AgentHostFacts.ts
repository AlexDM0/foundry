/** The `AgentHostFacts` port: what Claude Code's own files and rules look like on a platform, known only inside this package. */
import type { SandboxDenyShape } from '../agent-launch/WorkerProfile.ts';

export interface AgentHostFacts {
  /** An absolute path as a permission or sandbox rule writes it. */
  rulePathOf(absolutePath: string): string;
  /** An absolute path as `claudeMdExcludes` writes it. */
  excludePathOf(absolutePath: string): string;
  /** The tools a command prefix or a network guard covers. */
  readonly shellToolNames:       readonly string[];
  /** The user's Claude Code folder. */
  configFolderOf(homeDirectory: string): string;
  credentialPathsOf(homeDirectory: string): readonly string[];
  readonly sandboxSettingsApply: boolean;
  /** Seatbelt matches a deny as a path rule; bubblewrap, Claude Code's sandbox on Linux, mounts over each path at launch. */
  readonly sandboxDenyShape:     SandboxDenyShape;
}
