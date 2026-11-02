/**
 * Claude Code on Windows: a rule path in the normalised form its permissions docs give, `C:\Users\alice` as `/c/Users/alice`, anchored
 * at the root as `//c/Users/alice`; an exclude with forward slashes, since `claudeMdExcludes` is a glob and a backslash escapes in it.
 * No native Windows sandbox exists, so no sandbox setting applies.
 */
import { win32 } from 'node:path';

import { type AgentHostFacts, CLAUDE_SHELL_TOOL_NAMES } from './AgentHostFacts.ts';
import { claudeConfigFolderOf }                         from './ClaudeConfigFolder.ts';

const HOME_CREDENTIAL_NAMES = ['.ssh', '.aws', '_netrc', '.netrc', '.git-credentials'] as const;
const CLAUDE_CREDENTIALS_FILE_NAME = '.credentials.json';
const ANTHROPIC_PROFILE_FOLDER = ['.config', 'anthropic'] as const;
const DRIVE_PATH = /^([A-Za-z]):[\\/]*(.*)$/s;
const BACKSLASHES = /\\/g;

function forwardSlashesOf(path: string): string {
  return path.replace(BACKSLASHES, '/');
}

function rulePathOf(absolutePath: string): string {
  const drivePath = DRIVE_PATH.exec(absolutePath);
  // A UNC path already starts with two slashes once its backslashes turn.
  if (drivePath === null) return forwardSlashesOf(absolutePath).startsWith('//') ? forwardSlashesOf(absolutePath) : `/${forwardSlashesOf(absolutePath)}`;
  const [, driveLetter = '', rest = ''] = drivePath;
  return `//${driveLetter.toLowerCase()}/${forwardSlashesOf(rest)}`;
}

function configFolderOf(homeDirectory: string, configFolderVariable: string | undefined): string {
  return claudeConfigFolderOf(homeDirectory, configFolderVariable, win32.join);
}

function credentialPathsOf(homeDirectory: string, configFolder: string): string[] {
  return [
    ...HOME_CREDENTIAL_NAMES.map((name) => win32.join(homeDirectory, name)),
    win32.join(configFolder, CLAUDE_CREDENTIALS_FILE_NAME),
    win32.join(homeDirectory, ...ANTHROPIC_PROFILE_FOLDER),
  ];
}

export const WINDOWS_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({
  pathModule:           win32,
  rulePathOf,
  excludePathOf:        forwardSlashesOf,
  shellToolNames:       CLAUDE_SHELL_TOOL_NAMES,
  configFolderOf,
  credentialPathsOf,
  sandboxSettingsApply: false,
  sandboxDenyShape:     'path-rules',
});
