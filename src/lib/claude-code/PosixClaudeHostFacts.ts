import { posix } from 'node:path';

import type { AgentHostFacts } from './AgentHostFacts.ts';

const CONFIG_FOLDER_NAME = '.claude';
/** The keys, cloud and git logins a user keeps under the home folder. */
const HOME_CREDENTIAL_NAMES = ['.ssh', '.aws', '.netrc', '.git-credentials'] as const;
/** Claude Code's login where no keychain holds it, as on Linux; on macOS it is the fallback when the keychain is unavailable. */
const CLAUDE_CREDENTIALS_FILE_NAME = '.credentials.json';
const ANTHROPIC_PROFILE_FOLDER = ['.config', 'anthropic'] as const;

function configFolderOf(homeDirectory: string): string {
  return posix.join(homeDirectory, CONFIG_FOLDER_NAME);
}

function credentialPathsOf(homeDirectory: string): string[] {
  return [
    ...HOME_CREDENTIAL_NAMES.map((name) => posix.join(homeDirectory, name)),
    posix.join(configFolderOf(homeDirectory), CLAUDE_CREDENTIALS_FILE_NAME),
    posix.join(homeDirectory, ...ANTHROPIC_PROFILE_FOLDER),
  ];
}

export const POSIX_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({
  pathModule:           posix,
  // In a settings file a single leading slash anchors at the file's folder; `//` anchors at the filesystem root.
  rulePathOf:           (absolutePath) => `/${absolutePath}`,
  excludePathOf:        (absolutePath) => absolutePath,
  shellToolNames:       ['Bash'],
  configFolderOf,
  credentialPathsOf,
  sandboxSettingsApply: true,
  sandboxDenyShape:     'path-rules',
});

export const LINUX_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({ ...POSIX_CLAUDE_HOST_FACTS, sandboxDenyShape: 'mount-points' });
