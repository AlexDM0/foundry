/** The `AgentHostFacts` port: what Claude Code's own files and rules look like on a platform, known only inside this package. */
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
}
