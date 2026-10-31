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
    claim: 'finds the config folder under the launch environment, and none without a home',
    check: (facts) => {
      expect(facts.configFolderOf({ HOME: '/Users/example' })).toBe('/Users/example/.claude');
      expect(facts.configFolderOf({})).toBeNull();
    },
  },
  {
    claim: 'names the shell tool, the home credential folders, and that sandbox settings apply',
    check: (facts) => {
      expect(facts.shellToolNames).toEqual(['Bash']);
      expect(facts.credentialPathsOf('/Users/example')).toEqual(['/Users/example/.ssh', '/Users/example/.aws']);
      expect(facts.sandboxSettingsApply).toBe(true);
    },
  },
];

runPortContract('AgentHostFacts', [
  { name: 'PosixClaudeHostFacts', build: () => POSIX_CLAUDE_HOST_FACTS },
  { name: 'the native adapter', build: () => agentHostFactsFor('darwin') },
], CLAUSES);

test('a platform with no adapter refuses a path and applies no sandbox setting', () => {
  const facts = agentHostFactsFor('win32');
  expect(() => facts.rulePathOf('/any')).toThrow('win32');
  expect(() => facts.configFolderOf({})).toThrow('win32');
  expect(facts.sandboxSettingsApply).toBe(false);
});
