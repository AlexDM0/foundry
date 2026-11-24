/** The `AgentHostFacts` port: what Claude Code's own files and rules look like on a platform, known only inside this package. */
import type { posix } from 'node:path';

import type { SandboxDenyShape } from '../agent-launch/WorkerProfile.ts';

/** Claude Code's shell tools: Bash, and PowerShell, which a Windows host has natively and any host with `pwsh` can turn on. */
export const CLAUDE_SHELL_TOOL_NAMES: readonly string[] = ['Bash', 'PowerShell'];

export interface AgentHostFacts {
  /** How this platform splits and joins the native paths a request carries, so the instruction-file walk runs on any host. */
  readonly pathModule:           typeof posix;
  /** An absolute path as a permission or sandbox rule writes it. */
  rulePathOf(absolutePath: string): string;
  /** An absolute path as `claudeMdExcludes` writes it. */
  excludePathOf(absolutePath: string): string;
  /** The tools a command prefix or a network guard covers. */
  readonly shellToolNames:       readonly string[];
  /** The user's Claude Code folder: the one `CLAUDE_CONFIG_DIR` names, given as `configFolderVariable`, else the home folder's. */
  configFolderOf(homeDirectory: string, configFolderVariable: string | undefined): string;
  /** The Claude login sits in `configFolder`, the answer of `configFolderOf`. */
  credentialPathsOf(homeDirectory: string, configFolder: string): readonly string[];
  readonly sandboxSettingsApply: boolean;
  /** Seatbelt matches a deny as a path rule; bubblewrap, Claude Code's sandbox on Linux, mounts over each path at launch. */
  readonly sandboxDenyShape:     SandboxDenyShape;
  /** The file name of the `claude` program on this platform. */
  readonly programFileName:      string;
  /** The folders only Claude Code's own installers put the program in, under the home folder; the platform's program folders follow them. */
  readonly vendorProgramFolders: readonly (readonly string[])[];
}
