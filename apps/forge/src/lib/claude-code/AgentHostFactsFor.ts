/** The one selector of the `AgentHostFacts` port; a platform with no adapter refuses a path rule, and a process starts there all the same. */
import { posix } from 'node:path';

import type { AgentHostFacts }                              from './AgentHostFacts.ts';
import { LINUX_CLAUDE_HOST_FACTS, POSIX_CLAUDE_HOST_FACTS } from './PosixClaudeHostFacts.ts';
import { WINDOWS_CLAUDE_HOST_FACTS }                        from './WindowsClaudeHostFacts.ts';

export function agentHostFactsFor(platform: string): AgentHostFacts {
  if (platform === 'darwin') return POSIX_CLAUDE_HOST_FACTS;
  if (platform === 'linux') return LINUX_CLAUDE_HOST_FACTS;
  if (platform === 'win32') return WINDOWS_CLAUDE_HOST_FACTS;
  const refuse = (): never => {
    throw new Error(`no Claude Code host facts exist for the platform ${platform}`);
  };
  return Object.freeze<AgentHostFacts>({
    pathModule:           posix,
    rulePathOf:           refuse,
    excludePathOf:        refuse,
    shellToolNames:       [],
    configFolderOf:       refuse,
    credentialPathsOf:    refuse,
    sandboxSettingsApply: false,
    sandboxDenyShape:     'path-rules',
    programPlacesOf:      () => [],
  });
}
