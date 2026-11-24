import { posix } from 'node:path';

import { type AgentHostFacts, CLAUDE_SHELL_TOOL_NAMES } from './AgentHostFacts.ts';
import { claudeConfigFolderOf }                         from './ClaudeConfigFolder.ts';

/** The keys, cloud and git logins a user keeps under the home folder. */
const HOME_CREDENTIAL_NAMES = ['.ssh', '.aws', '.netrc', '.git-credentials'] as const;
/** Claude Code's login where no keychain holds it, as on Linux; on macOS it is the fallback when the keychain is unavailable. */
const CLAUDE_CREDENTIALS_FILE_NAME = '.credentials.json';
const ANTHROPIC_PROFILE_FOLDER = ['.config', 'anthropic'] as const;
/** The native installer's link, the older local install, and Homebrew's two prefixes. */
const HOME_PROGRAM_PLACES = [['.local', 'bin', 'claude'], ['.claude', 'local', 'claude']] as const;
const SYSTEM_PROGRAM_PLACES = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'] as const;

function configFolderOf(homeDirectory: string, configFolderVariable: string | undefined): string {
  return claudeConfigFolderOf(homeDirectory, configFolderVariable, posix.join);
}

function credentialPathsOf(homeDirectory: string, configFolder: string): string[] {
  return [
    ...HOME_CREDENTIAL_NAMES.map((name) => posix.join(homeDirectory, name)),
    posix.join(configFolder, CLAUDE_CREDENTIALS_FILE_NAME),
    posix.join(homeDirectory, ...ANTHROPIC_PROFILE_FOLDER),
  ];
}

function programPlacesOf(homeDirectory: string): string[] {
  return [...HOME_PROGRAM_PLACES.map((parts) => posix.join(homeDirectory, ...parts)), ...SYSTEM_PROGRAM_PLACES];
}

export const POSIX_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({
  pathModule:           posix,
  // In a settings file a single leading slash anchors at the file's folder; `//` anchors at the filesystem root.
  rulePathOf:           (absolutePath) => `/${absolutePath}`,
  excludePathOf:        (absolutePath) => absolutePath,
  shellToolNames:       CLAUDE_SHELL_TOOL_NAMES,
  configFolderOf,
  credentialPathsOf,
  sandboxSettingsApply: true,
  sandboxDenyShape:     'path-rules',
  programPlacesOf,
});

export const LINUX_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({ ...POSIX_CLAUDE_HOST_FACTS, sandboxDenyShape: 'mount-points' });
