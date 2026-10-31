import { posix } from 'node:path';

import type { AgentHostFacts } from './AgentHostFacts.ts';

const HOME_VARIABLE = 'HOME';
const CONFIG_FOLDER_NAME = '.claude';
const CREDENTIAL_FOLDER_NAMES = ['.ssh', '.aws'] as const;

export const POSIX_CLAUDE_HOST_FACTS: AgentHostFacts = Object.freeze<AgentHostFacts>({
  // In a settings file a single leading slash anchors at the file's folder; `//` anchors at the filesystem root.
  rulePathOf:     (absolutePath) => `/${absolutePath}`,
  excludePathOf:  (absolutePath) => absolutePath,
  shellToolNames: ['Bash'],
  configFolderOf: (environment) => {
    const home = Object.hasOwn(environment, HOME_VARIABLE) ? environment[HOME_VARIABLE] : undefined;
    return home === undefined ? null : posix.join(home, CONFIG_FOLDER_NAME);
  },
  credentialPathsOf:    (homeDirectory) => CREDENTIAL_FOLDER_NAMES.map((folderName) => posix.join(homeDirectory, folderName)),
  sandboxSettingsApply: true,
});
