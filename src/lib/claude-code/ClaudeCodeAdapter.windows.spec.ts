/**
 * Claude Code on Windows reads a rule path in its normalised form, `C:\Users\alice` as `/c/Users/alice` and `//c/Users/alice` anchored
 * at the root, and a `claudeMdExcludes` entry as a glob, where a backslash escapes. A native path written as it is matches nothing and no
 * error says so. These cases feed `node:path` win32 paths to every place the adapter renders a path, on any host, and hold that none
 * keeps a backslash or a drive colon.
 */
import { win32 } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentLaunchPlan }                                             from '../agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                                          from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                                               from '../agent-launch/WorkerProfile.ts';
import { agentHostFactsFor }                                                from './AgentHostFactsFor.ts';
import { claudeCodeAdapterFor, claudeSessionIdOf, createClaudeCodeAdapter } from './ClaudeCodeAdapter.ts';

const HOME = 'C:\\Users\\alice';
const REPOSITORY = win32.join(HOME, 'repo');
const WORKTREE = win32.join(REPOSITORY, '.example-worktrees', 'ticket-7');
const HATCH = win32.join(REPOSITORY, '.example-worktrees', 'hatch', 'J1');
const JOB_FILES = win32.join(REPOSITORY, '.example-data', 'jobs', 'J1');

const WINDOWS_ADAPTER = claudeCodeAdapterFor('win32');
/** Windows facts with the sandbox rendered, so the sandbox's path sites are fed win32 paths too. */
const WINDOWS_ADAPTER_WITH_SANDBOX = createClaudeCodeAdapter({ ...agentHostFactsFor('win32'), sandboxSettingsApply: true });

function windowsProfile(): WorkerProfile {
  return {
    writableRoots:          [win32.join(HOME, '.cache', 'example-uv')],
    deniedWritableRoots:    [win32.join(REPOSITORY, '.example-data'), win32.join(WORKTREE, '.claude')],
    deniedReadableRoots:    [win32.join(HOME, '.ssh')],
    bashNetworkDomains:     [],
    webNetworkDomains:      'none',
    hatchDirectory:         HATCH,
    allowedCommandPrefixes: [['git', 'commit']],
    deniedCommandPrefixes:  [['git', 'push']],
    askUser:                true,
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       REPOSITORY,
    gitHooksDirectory:      win32.join(REPOSITORY, '.example-worktrees', 'git-hooks', 'J1'),
    commitSigning:          { kind: 'agent-sockets', sockets: [win32.join(HOME, 'AppData', 'Roaming', 'gnupg', 'S.gpg-agent')] },
    networkDomainGuard:     null,
  };
}

function windowsRequest(): AgentLaunchRequest {
  return {
    programPath:       win32.join(HOME, '.local', 'bin', 'claude.exe'),
    sessionId:         claudeSessionIdOf('tracker-example', 'J1'),
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     HOME,
    firstMessage:      'Build the ticket.',
    roleBrief:         'You are a builder.',
    model:             'opus',
    effort:            'medium',
    environment:       { USERPROFILE: HOME },
    profile:           windowsProfile(),
    confinement:       'unconfined-by-design',
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
}

interface RenderedSettings {
  claudeMdExcludes: string[];
  sandbox?:         { network: { allowUnixSockets?: string[] }; filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] } };
  permissions:      { allow: string[]; deny: string[] };
}

function settingsOf(plan: AgentLaunchPlan): RenderedSettings {
  const file = plan.files.find((candidate) => candidate.path.endsWith('settings.json'));
  if (file === undefined) throw new Error('no settings.json in the plan');
  return JSON.parse(file.text) as RenderedSettings;
}

function everyRenderedPathOf(settings: RenderedSettings): string[] {
  const { sandbox } = settings;
  return [
    ...settings.claudeMdExcludes,
    ...settings.permissions.allow,
    ...settings.permissions.deny,
    ...sandbox === undefined ? [] : [...sandbox.network.allowUnixSockets ?? [], ...sandbox.filesystem.allowWrite, ...sandbox.filesystem.denyWrite, ...sandbox.filesystem.denyRead],
  ];
}

describe('the Windows host facts', () => {
  const facts = agentHostFactsFor('win32');

  test('render a deny of C:\\Users\\alice\\repo as //c/Users/alice/repo, the drive lower case', () => {
    expect(facts.rulePathOf('C:\\Users\\alice\\repo')).toBe('//c/Users/alice/repo');
    expect(facts.rulePathOf('d:\\Work')).toBe('//d/Work');
  });

  test('render an exclude with forward slashes only', () => {
    expect(facts.excludePathOf('C:\\Users\\alice\\CLAUDE.md')).toBe('C:/Users/alice/CLAUDE.md');
  });

  test('find the config folder under the user profile, or where CLAUDE_CONFIG_DIR points', () => {
    expect(facts.configFolderOf(HOME, undefined)).toBe('C:\\Users\\alice\\.claude');
    expect(facts.configFolderOf(HOME, 'D:\\claude-config')).toBe('D:\\claude-config');
  });

  test('apply no sandbox setting, since Claude Code has no native Windows sandbox', () => {
    expect(facts.sandboxSettingsApply).toBe(false);
  });
});

describe('the Windows rendering of a plan', () => {
  const adapters = [['the native adapter', WINDOWS_ADAPTER], ['an adapter rendering the sandbox', WINDOWS_ADAPTER_WITH_SANDBOX]] as const;
  for (const [adapterName, adapter] of adapters) {
    test(`${adapterName} renders no path with a backslash or a slash before a drive colon`, () => {
      const renderedPaths = everyRenderedPathOf(settingsOf(adapter.planOf(windowsRequest())));
      expect(renderedPaths.length).toBeGreaterThan(0);
      expect(renderedPaths.filter((path) => path.includes('\\') || /\/[A-Za-z]:/.test(path))).toEqual([]);
    });
  }

  test('the permission rules anchor every path at the root in the normalised form', () => {
    const { permissions } = settingsOf(WINDOWS_ADAPTER.planOf(windowsRequest()));
    expect(permissions.allow).toEqual(expect.arrayContaining([
      'Edit(//c/Users/alice/repo/.example-worktrees/ticket-7/**)',
      'Write(//c/Users/alice/repo/.example-worktrees/ticket-7/**)',
    ]));
    expect(permissions.deny).toEqual(expect.arrayContaining([
      'Edit(//c/Users/alice/repo/.example-data)',
      'Write(//c/Users/alice/repo/.example-data/**)',
      'Read(//c/Users/alice/.ssh)',
      'Read(//c/Users/alice/.ssh/**)',
    ]));
  });

  const SHELL_RULE_TABLE: readonly { list: 'allow' | 'deny'; rules: readonly string[] }[] = [
    { list: 'allow', rules: ['Bash(git commit *)', 'PowerShell(git commit *)'] },
    { list: 'deny', rules: ['Bash(git push *)', 'PowerShell(git push *)'] },
  ];
  for (const row of SHELL_RULE_TABLE) {
    test(`the ${row.list} rules hold ${row.rules.join(' beside ')}, so a native Windows host without Git Bash is ruled too`, () => {
      const { permissions } = settingsOf(WINDOWS_ADAPTER.planOf(windowsRequest()));
      expect(permissions[row.list].filter((rule) => /^(Bash|PowerShell)\(/.test(rule))).toEqual([...row.rules]);
    });
  }

  test('a guarded profile runs the guard by its .exe path in exec form before Bash, PowerShell and WebFetch', () => {
    const programPath = win32.join(HOME, '.bun', 'bin', 'example-program.exe');
    const guard = { allowedDomains: ['registry.example.com'], programPath, arguments: ['guard', '--allow', 'registry.example.com'] };
    const plan = WINDOWS_ADAPTER.planOf({ ...windowsRequest(), profile: { ...windowsProfile(), networkDomainGuard: guard } });
    const file = plan.files.find((candidate) => candidate.path.endsWith('settings.json'));
    const hook = { type: 'command', command: programPath, args: guard.arguments };
    expect(JSON.parse(file?.text ?? '{}')).toMatchObject({ hooks: { PreToolUse: ['Bash', 'PowerShell', 'WebFetch'].map((matcher) => ({ matcher, hooks: [hook] })) }, });
  });

  test('a confined request is refused, so no session meant to be confined starts without a sandbox', () => {
    expect(() => WINDOWS_ADAPTER.planOf({ ...windowsRequest(), confinement: 'confined' })).toThrow('no Claude Code sandbox setting applies');
  });

  test('the sandbox sets and the signing sockets use the normalised form', () => {
    const { sandbox } = settingsOf(WINDOWS_ADAPTER_WITH_SANDBOX.planOf(windowsRequest()));
    expect(sandbox?.filesystem.allowWrite).toEqual(['//c/Users/alice/repo/.example-worktrees/hatch/J1', '//c/Users/alice/.cache/example-uv']);
    expect(sandbox?.filesystem.denyRead).toEqual(['//c/Users/alice/.ssh']);
    expect(sandbox?.network.allowUnixSockets).toEqual(['//c/Users/alice/AppData/Roaming/gnupg/S.gpg-agent']);
  });

  test('the exclusions walk every folder above the repository up to the drive root, with forward slashes', () => {
    const { claudeMdExcludes } = settingsOf(WINDOWS_ADAPTER.planOf(windowsRequest()));
    expect(claudeMdExcludes).toEqual(expect.arrayContaining([
      'C:/Users/alice/CLAUDE.md',
      'C:/Users/alice/.claude/CLAUDE.md',
      'C:/Users/CLAUDE.local.md',
      'C:/CLAUDE.md',
    ]));
    expect(claudeMdExcludes.some((path) => path.startsWith('C:/Users/alice/repo/'))).toBe(false);
  });
});
