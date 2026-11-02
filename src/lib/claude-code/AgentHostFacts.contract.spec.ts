/** One contract for the `AgentHostFacts` port: paths as Claude Code's files write them, the config folder, and the tools a rule covers. */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import type { AgentHostFacts }              from './AgentHostFacts.ts';
import { agentHostFactsFor }                from './AgentHostFactsFor.ts';
import { POSIX_CLAUDE_HOST_FACTS }          from './PosixClaudeHostFacts.ts';

const CLAUSES: readonly PortClause<AgentHostFacts>[] = [
  {
    claim: 'anchors a rule path at the filesystem root and keeps an exclude path as it is',
    check: (facts) => {
      expect(facts.rulePathOf('/Users/example/worktree')).toBe('//Users/example/worktree');
      expect(facts.excludePathOf('/Users/example/CLAUDE.md')).toBe('/Users/example/CLAUDE.md');
    },
  },
  {
    claim: 'finds the config folder under the home folder, or where CLAUDE_CONFIG_DIR points when it is set and not blank',
    check: (facts) => {
      expect(facts.configFolderOf('/Users/example', undefined)).toBe('/Users/example/.claude');
      expect(facts.configFolderOf('/Users/example', ' ')).toBe('/Users/example/.claude');
      expect(facts.configFolderOf('/Users/example', '/srv/claude-config')).toBe('/srv/claude-config');
    },
  },
  {
    claim: 'names the shell tool, the home credentials, the Claude login in the config folder and the Anthropic profile folder, and that sandbox settings apply',
    check: (facts) => {
      expect(facts.shellToolNames).toEqual(['Bash']);
      expect(facts.credentialPathsOf('/Users/example', '/srv/claude-config')).toEqual([
        '/Users/example/.ssh',
        '/Users/example/.aws',
        '/Users/example/.netrc',
        '/Users/example/.git-credentials',
        '/srv/claude-config/.credentials.json',
        '/Users/example/.config/anthropic',
      ]);
      expect(facts.sandboxSettingsApply).toBe(true);
    },
  },
];

runPortContract('AgentHostFacts', [
  { name: 'PosixClaudeHostFacts', build: () => POSIX_CLAUDE_HOST_FACTS },
  { name: 'the native adapter', build: () => agentHostFactsFor('darwin') },
], CLAUSES);

test('Linux shares the macOS paths and tools, and its sandbox applies a deny as a mount point, macOS as a path rule', () => {
  expect(agentHostFactsFor('linux')).toEqual({ ...POSIX_CLAUDE_HOST_FACTS, sandboxDenyShape: 'mount-points' });
  expect(agentHostFactsFor('darwin').sandboxDenyShape).toBe('path-rules');
});

test('a platform with no adapter refuses a path and applies no sandbox setting', () => {
  const facts = agentHostFactsFor('freebsd');
  expect(() => facts.rulePathOf('/any')).toThrow('freebsd');
  expect(() => facts.configFolderOf('/any', undefined)).toThrow('freebsd');
  expect(facts.sandboxSettingsApply).toBe(false);
});
