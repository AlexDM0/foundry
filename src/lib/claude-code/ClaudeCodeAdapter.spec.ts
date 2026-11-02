/**
 * The adapter is the whole of what a launched session may do, so these cases hold its rendering per role as a table: the command line
 * of design section 4.2, the settings that confine the session (sandbox sets as `//`-anchored paths, git denies, no attribution, no
 * memory, no instruction file above the repository), the subagents, the git configuration, the scrubbed environment, the one standing
 * reply, and the lines a Watcher sends, against the ones the probes recorded.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentAdapter }                   from '../agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan, StandingReply } from '../agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }             from '../agent-launch/AgentLaunchRequest.ts';
import { POSIX_LAUNCH_ENVIRONMENT }            from '../agent-launch/PosixLaunchEnvironment.ts';
import { WINDOWS_LAUNCH_ENVIRONMENT }          from '../agent-launch/WindowsLaunchEnvironment.ts';
import type { WorkerProfile }                  from '../agent-launch/WorkerProfile.ts';
import type { AgentHostFacts }                 from './AgentHostFacts.ts';
import {
  CLAUDE_NESTING_VARIABLES,
  claudeCodeAdapterFor,
  claudeSessionIdOf,
  createClaudeCodeAdapter
} from './ClaudeCodeAdapter.ts';
import { POSIX_CLAUDE_HOST_FACTS } from './PosixClaudeHostFacts.ts';

const REPOSITORY = '/Users/example/development/example-repository';
const CLAUDE_CODE_ADAPTER = claudeCodeAdapterFor('darwin');
const WORKTREE = `${REPOSITORY}/.example-worktrees/ticket-7`;
const JOB_FILES = `${REPOSITORY}/.example-data/jobs/J1`;
const HATCH = `${REPOSITORY}/.example-worktrees/hatch/J1`;
const FIXTURES_FOLDER = join(import.meta.dir, 'testing', 'fixtures');
const CLAUDE_PROGRAM_PATH = '/Users/example/.local/bin/claude';

type Role = 'builder' | 'reviewer' | 'merge-fix' | 'resolver' | 'product-owner' | 'assistant';

const GIT_DENIES = [
  ['git', 'push'], ['git', 'rebase'], ['git', 'reset'], ['git', 'commit', '--amend'], ['git', 'worktree'], ['git', 'update-ref'], ['git', 'branch', '-f'], ['git', '-C'],
];

function profileOf(role: Role): WorkerProfile {
  const workerRole = role !== 'product-owner' && role !== 'assistant';
  return {
    writableRoots:       [],
    deniedWritableRoots: [`${REPOSITORY}/.example-data`, `${WORKTREE}/.claude`, `${REPOSITORY}/.git/packed-refs`],
    deniedReadableRoots: [`${REPOSITORY}/.example-data/jobs/*/launch-*.json`, '/Users/example/.ssh', '/Users/example/.gnupg/private-keys-v1.d'],
    bashNetworkDomains:  role === 'builder' ? ['registry.example.com'] : [],
    webNetworkDomains:   {
      'builder': ['registry.example.com'], 'reviewer': 'none', 'merge-fix': 'none', 'resolver': 'none', 'product-owner': 'any', 'assistant': 'none'
    }[role] as WorkerProfile['webNetworkDomains'],
    hatchDirectory:         HATCH,
    allowedCommandPrefixes: [['uv'], ['git', 'commit']],
    deniedCommandPrefixes:  workerRole ? GIT_DENIES : [],
    askUser:                role === 'builder' || role === 'reviewer' || role === 'product-owner',
    skills:                 role === 'product-owner',
    subagents:              [{
      name: 'coder', model: 'opus', effort: 'medium', readOnly: false
    }, {
      name: 'explorer', model: 'haiku', effort: 'low', readOnly: true
    }],
    attribution:        'none',
    instructionsRoot:   REPOSITORY,
    gitHooksDirectory:  `${REPOSITORY}/.example-worktrees/git-hooks/J1`,
    commitSigning:      { kind: 'agent-sockets', sockets: ['/Users/example/.gnupg/S.gpg-agent', '/Users/example/.gnupg/S.keyboxd'] },
    networkDomainGuard: null,
  };
}

const GUARD_PROGRAM_PATH = '/Users/example/.bun/bin/example-program';
const GUARD_ARGUMENTS = ['guard', '--allow', 'registry.example.com,*.docs.example.org'];

function guardedRequestOf(role: Role, programPath: string | null = GUARD_PROGRAM_PATH): AgentLaunchRequest {
  const profile: WorkerProfile = {
    ...profileOf(role),
    networkDomainGuard: { allowedDomains: ['registry.example.com', '*.docs.example.org'], programPath, arguments: GUARD_ARGUMENTS },
  };
  return requestOf(role, { profile });
}

function requestOf(role: Role, overrides: Partial<AgentLaunchRequest> = {}): AgentLaunchRequest {
  return {
    programPath:       CLAUDE_PROGRAM_PATH,
    sessionId:         claudeSessionIdOf('tracker-example', 'J1'),
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     '/Users/example',
    firstMessage:      'Build the ticket.',
    roleBrief:         'You are a builder.',
    model:             'opus',
    effort:            'medium',
    environment:       { HOME: '/Users/example', PATH: '/usr/bin:/bin', USER: 'example' },
    profile:           profileOf(role),
    confinement:       'confined',
    jobFilesDirectory: JOB_FILES,
    reportSchema:      role === 'product-owner' || role === 'assistant' ? null : { type: 'object', required: ['role'] },
    ...overrides,
  };
}

function fileText(plan: AgentLaunchPlan, fileName: string): string {
  const file = plan.files.find((candidate) => candidate.path === join(JOB_FILES, fileName));
  if (file === undefined) throw new Error(`no ${fileName} in the plan`);
  return file.text;
}

interface RenderedSettings {
  includeCoAuthoredBy: boolean;
  attribution:         unknown;
  autoMemoryEnabled:   boolean;
  claudeMdExcludes:    string[];
  sandbox:             {
    network:    { allowedDomains: string[]; strictAllowlist: boolean; allowUnixSockets?: string[] };
    filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] };
  } & Record<string, unknown>;
  permissions: { allow: string[]; deny: string[] };
}

function settingsOf(plan: AgentLaunchPlan): RenderedSettings {
  return JSON.parse(fileText(plan, 'settings.json')) as RenderedSettings;
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

describe('claudeSessionIdOf', () => {
  test('formats sha256(scope, job) as a stable version-8 UUID that differs per job and per scope', () => {
    const sessionId = claudeSessionIdOf('tracker-example', 'J1');
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // `printf 'tracker-example\nJ1' | shasum -a 256` is bca52fe829c10cec534d7b95…, its version and variant digits replaced.
    expect(sessionId).toBe('bca52fe8-29c1-8cec-934d-7b95d410277d');
    expect(claudeSessionIdOf('tracker-example', 'J1')).toBe(sessionId);
    expect(claudeSessionIdOf('tracker-example', 'J2')).not.toBe(sessionId);
    expect(claudeSessionIdOf('tracker-other', 'J1')).not.toBe(sessionId);
  });
});

describe('the command line, per role', () => {
  const ROLE_TABLE: readonly { role: Role; slashCommandsOff: boolean; disallowedTools: string | undefined; reportSchema: boolean }[] = [
    {
      role: 'builder', slashCommandsOff: true, disallowedTools: 'WebSearch', reportSchema: true
    },
    {
      role: 'reviewer', slashCommandsOff: true, disallowedTools: 'WebSearch,WebFetch', reportSchema: true
    },
    {
      role: 'merge-fix', slashCommandsOff: true, disallowedTools: 'WebSearch,WebFetch,AskUserQuestion', reportSchema: true
    },
    {
      role: 'resolver', slashCommandsOff: true, disallowedTools: 'WebSearch,WebFetch,AskUserQuestion', reportSchema: true
    },
    {
      role: 'product-owner', slashCommandsOff: false, disallowedTools: undefined, reportSchema: false
    },
    {
      role: 'assistant', slashCommandsOff: true, disallowedTools: 'WebSearch,WebFetch,AskUserQuestion', reportSchema: false
    },
  ];

  for (const row of ROLE_TABLE) {
    const schemaWording = row.reportSchema ? 'with' : 'without';
    test(`${row.role}: slash commands ${row.slashCommandsOff ? 'off' : 'on'}, disallowed ${row.disallowedTools ?? 'nothing'}, ${schemaWording} a report schema`, () => {
      const { argv } = CLAUDE_CODE_ADAPTER.planOf(requestOf(row.role));
      expect(argv.includes('--disable-slash-commands')).toBe(row.slashCommandsOff);
      expect(valueAfter(argv, '--disallowedTools')).toBe(row.disallowedTools);
      expect(argv.includes('--json-schema')).toBe(row.reportSchema);
    });
  }

  test('a fresh builder runs the exact command line of design section 4.2', () => {
    const request = requestOf('builder');
    expect(CLAUDE_CODE_ADAPTER.planOf(request).argv).toEqual([
      CLAUDE_PROGRAM_PATH,
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      request.sessionId,
      '--model',
      'opus',
      '--effort',
      'medium',
      '--setting-sources',
      'project',
      '--strict-mcp-config',
      '--mcp-config',
      `${JOB_FILES}/mcp.json`,
      '--settings',
      `${JOB_FILES}/settings.json`,
      '--agents',
      `${JOB_FILES}/agents.json`,
      '--append-system-prompt-file',
      `${JOB_FILES}/role.md`,
      '--json-schema',
      fileText(CLAUDE_CODE_ADAPTER.planOf(request), 'report.schema.json'),
      '--permission-mode',
      'auto',
      '--permission-prompt-tool',
      'stdio',
      '--disable-slash-commands',
      '--disallowedTools',
      'WebSearch',
    ]);
  });

  test('a resume passes --resume with the same id alone, never --session-id beside it', () => {
    const request = requestOf('builder', { resume: true });
    const { argv } = CLAUDE_CODE_ADAPTER.planOf(request);
    expect(valueAfter(argv, '--resume')).toBe(request.sessionId);
    expect(argv.includes('--session-id')).toBe(false);
    expect(argv.includes('--fork-session')).toBe(false);
  });

  test('the job\'s files are the settings, agents, MCP, role and report schema files the command line names', () => {
    const plan = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder'));
    expect(plan.files.map((file) => file.path)).toEqual(['settings.json', 'agents.json', 'mcp.json', 'role.md', 'report.schema.json'].map((name) => join(JOB_FILES, name)));
    expect(JSON.parse(fileText(plan, 'mcp.json'))).toEqual({ mcpServers: {} });
    expect(fileText(plan, 'role.md')).toBe('You are a builder.');
    expect(JSON.parse(fileText(plan, 'report.schema.json'))).toEqual({ type: 'object', required: ['role'] });
  });
});

describe('the rendered settings', () => {
  const ROLES: readonly Role[] = ['builder', 'reviewer', 'merge-fix', 'resolver', 'product-owner', 'assistant'];

  for (const role of ROLES) {
    test(`${role}: no attribution, no auto-memory, and every instruction file above the repository excluded`, () => {
      const settings = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf(role)));
      expect(settings.includeCoAuthoredBy).toBe(false);
      expect(settings.attribution).toEqual({ commit: '', pr: '' });
      expect(settings.autoMemoryEnabled).toBe(false);
      expect(settings.claudeMdExcludes).toContain('/Users/example/.claude/CLAUDE.md');
      expect(settings.claudeMdExcludes).toContain('/Users/example/development/CLAUDE.md');
      expect(settings.claudeMdExcludes).toContain('/Users/example/development/CLAUDE.local.md');
      expect(settings.claudeMdExcludes).toContain('/CLAUDE.md');
      expect(settings.claudeMdExcludes.some((path) => path.startsWith(`${REPOSITORY}/`))).toBe(false);
    });
  }

  test('the user CLAUDE.md is excluded from the request\'s home, with no HOME in the launch environment', () => {
    const settings = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf('builder', { environment: { PATH: '/usr/bin:/bin' }, homeDirectory: '/Users/other-example' })));
    expect(settings.claudeMdExcludes).toContain('/Users/other-example/.claude/CLAUDE.md');
  });

  test('with CLAUDE_CONFIG_DIR set, the user CLAUDE.md and the Claude login are those of that folder', () => {
    const adapter  = claudeCodeAdapterFor('darwin', '/srv/claude-config');
    const settings = settingsOf(adapter.planOf(requestOf('builder')));
    expect(settings.claudeMdExcludes).toContain('/srv/claude-config/CLAUDE.md');
    expect(adapter.credentialPathsOf('/Users/example')).toContain('/srv/claude-config/.credentials.json');
  });

  test('the sandbox carries the write and read sets as //-anchored paths, the Hatch writable, the network strict', () => {
    const { sandbox } = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf('builder')));
    expect(sandbox).toMatchObject({
      enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: true
    });
    expect(sandbox.filesystem.allowWrite).toEqual([`/${HATCH}`]);
    expect(sandbox.filesystem.denyWrite).toEqual([`/${REPOSITORY}/.example-data`, `/${WORKTREE}/.claude`, `/${REPOSITORY}/.git/packed-refs`]);
    expect(sandbox.filesystem.denyRead).toEqual([`/${REPOSITORY}/.example-data/jobs/*/launch-*.json`, '//Users/example/.ssh', '//Users/example/.gnupg/private-keys-v1.d']);
    expect(sandbox.network).toMatchObject({ allowedDomains: ['registry.example.com'], strictAllowlist: true });
  });

  test('the gates\' writes the profile names are writable beside the Hatch, //-anchored', () => {
    const request = requestOf('builder');
    const plan    = CLAUDE_CODE_ADAPTER.planOf({ ...request, profile: { ...request.profile, writableRoots: ['/Users/example/.cache/example-uv'] } });
    expect(settingsOf(plan).sandbox.filesystem.allowWrite).toEqual([`/${HATCH}`, '//Users/example/.cache/example-uv']);
  });

  test('the signing allowance is the agent sockets alone, with the key folder\'s private keys read-denied, and no unsigned fallback', () => {
    const plan = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder'));
    expect(settingsOf(plan).sandbox.network.allowUnixSockets).toEqual(['//Users/example/.gnupg/S.gpg-agent', '//Users/example/.gnupg/S.keyboxd']);
    expect(settingsOf(plan).sandbox.filesystem.allowWrite.some((path) => path.includes('.gnupg'))).toBe(false);
    expect(Object.values(plan.environment)).not.toContain('commit.gpgsign');
  });

  test('the permission rules deny the git verbs, the denied roots for Edit and Write and the read set for Read, all //-anchored', () => {
    const { permissions } = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf('builder')));
    expect(permissions.deny).toEqual(expect.arrayContaining([
      'Bash(git push *)',
      'Bash(git rebase *)',
      'Bash(git reset *)',
      'Bash(git commit --amend *)',
      'Bash(git worktree *)',
      'Bash(git update-ref *)',
      'Bash(git branch -f *)',
      'Bash(git -C *)',
      `Edit(/${REPOSITORY}/.example-data/**)`,
      `Write(/${REPOSITORY}/.example-data/**)`,
      `Write(/${WORKTREE}/.claude/**)`,
      `Read(/${REPOSITORY}/.example-data/jobs/*/launch-*.json)`,
      'Read(//Users/example/.ssh/**)',
    ]));
    expect(permissions.allow).toEqual([
      'Read',
      'Agent',
      `Edit(/${WORKTREE}/**)`,
      `Write(/${WORKTREE}/**)`,
      'Bash(uv *)',
      'PowerShell(uv *)',
      'Bash(git commit *)',
      'PowerShell(git commit *)',
      'WebFetch(domain:registry.example.com)',
    ]);
  });

  test.each(['builder', 'reviewer', 'merge-fix', 'resolver'] as const)('%s: every command rule names PowerShell beside Bash, so neither shell escapes it', (role) => {
    const { permissions } = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf(role)));
    for (const rules of [permissions.allow, permissions.deny]) {
      const bashRules = rules.filter((rule) => rule.startsWith('Bash('));
      expect(bashRules.length).toBeGreaterThan(0);
      expect(rules.filter((rule) => rule.startsWith('PowerShell('))).toEqual(bashRules.map((rule) => rule.replace(/^Bash/, 'PowerShell')));
    }
  });

  test('a session whose WebFetch reaches any domain is still denied the loopback names', () => {
    const { permissions } = settingsOf(CLAUDE_CODE_ADAPTER.planOf(requestOf('product-owner')));
    expect(permissions.deny).toEqual(expect.arrayContaining(['WebFetch(domain:localhost)', 'WebFetch(domain:127.0.0.1)']));
  });

  test('a profile with a network domain guard runs it in exec form, its absolute path and arguments, before every shell and WebFetch call', () => {
    const settings = JSON.parse(fileText(CLAUDE_CODE_ADAPTER.planOf(guardedRequestOf('builder')), 'settings.json')) as { hooks: unknown };
    const hook = { type: 'command', command: GUARD_PROGRAM_PATH, args: GUARD_ARGUMENTS };
    expect(settings.hooks).toEqual({
      PreToolUse: [
        { matcher: 'Bash', hooks: [hook] },
        { matcher: 'PowerShell', hooks: [hook] },
        { matcher: 'WebFetch', hooks: [hook] },
      ],
    });
  });

  test('a guard whose program did not resolve renders no hook and denies every shell and WebFetch call, so none goes through unchecked', () => {
    const settings = JSON.parse(fileText(CLAUDE_CODE_ADAPTER.planOf(guardedRequestOf('builder', null)), 'settings.json')) as RenderedSettings & { hooks?: unknown };
    expect(settings.hooks).toBeUndefined();
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['Bash', 'PowerShell', 'WebFetch']));
  });

  test('a profile without a guard renders no hooks key, the settings text unchanged but for it', () => {
    const unguarded = fileText(CLAUDE_CODE_ADAPTER.planOf(requestOf('builder')), 'settings.json');
    const guarded = JSON.parse(fileText(CLAUDE_CODE_ADAPTER.planOf(guardedRequestOf('builder')), 'settings.json')) as Record<string, unknown>;
    expect(Object.hasOwn(JSON.parse(unguarded) as object, 'hooks')).toBe(false);
    const { hooks: _hooks, ...guardedWithoutHooks } = guarded;
    expect(unguarded).toBe(`${JSON.stringify(guardedWithoutHooks, null, 2)}\n`);
  });

  test('the agents are the coder, with edit tools, and the explorer, with Read and the rg, grep and find allow rules, each naming its model', () => {
    const agents = JSON.parse(fileText(CLAUDE_CODE_ADAPTER.planOf(requestOf('builder')), 'agents.json')) as Record<string, { model: string; effort: string; tools: string[] }>;
    expect(Object.keys(agents)).toEqual(['coder', 'explorer']);
    expect(agents['coder']).toMatchObject({ model: 'opus', effort: 'medium', tools: ['Read', 'Edit', 'Write', 'Bash', 'PowerShell'] });
    const explorerTools = ['Read', 'Bash(rg *)', 'PowerShell(rg *)', 'Bash(grep *)', 'PowerShell(grep *)', 'Bash(find *)', 'PowerShell(find *)'];
    expect(agents['explorer']).toMatchObject({ model: 'haiku', effort: 'low', tools: explorerTools });
  });
});

describe('the Linux rendering of the credential list', () => {
  const linuxAdapter = claudeCodeAdapterFor('linux');
  const linuxHome = '/home/alex-example';

  test.each(['builder', 'reviewer', 'resolver', 'product-owner', 'assistant'] as const)(
    'denies the %s reading the Claude login under its config folder and the Anthropic profile folder, in the sandbox and the Read rules',
    (role) => {
      const profile: WorkerProfile = { ...profileOf(role), deniedReadableRoots: [...linuxAdapter.credentialPathsOf(linuxHome)] };
      const settings = settingsOf(linuxAdapter.planOf(requestOf(role, { homeDirectory: linuxHome, profile })));
      const configFolder = POSIX_CLAUDE_HOST_FACTS.configFolderOf(linuxHome, undefined);
      expect(settings.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining([`/${configFolder}/.credentials.json`, `/${linuxHome}/.config/anthropic`]));
      expect(settings.permissions.deny).toEqual(expect.arrayContaining([`Read(/${configFolder}/.credentials.json)`, `Read(/${linuxHome}/.config/anthropic/**)`]));
    }
  );
});

describe('the child environment', () => {
  test('sets the per-job commit-msg hook folder and core.longpaths through GIT_CONFIG_* and drops every nesting variable it was given', () => {
    const nestingVariables = Object.fromEntries(CLAUDE_NESTING_VARIABLES.map((name) => [name, '1']));
    const plan = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder', { environment: { HOME: '/Users/example', ...nestingVariables } }));
    expect(plan.environment).toEqual({
      HOME:               '/Users/example',
      GIT_CONFIG_COUNT:   '2',
      GIT_CONFIG_KEY_0:   'core.hooksPath',
      GIT_CONFIG_VALUE_0: `${REPOSITORY}/.example-worktrees/git-hooks/J1`,
      GIT_CONFIG_KEY_1:   'core.longpaths',
      GIT_CONFIG_VALUE_1: 'true',
    });
  });

  /** Each row is one variable the Overseer's own environment holds, and whether the launched session gets it. */
  const FORWARDING_TABLE: readonly (readonly [string, 'passes' | 'dropped'])[] = [
    ['ANTHROPIC_API_KEY', 'passes'],
    ['ANTHROPIC_AUTH_TOKEN', 'passes'],
    ['CLAUDE_CODE_OAUTH_TOKEN', 'passes'],
    ['CLAUDE_CODE_USE_BEDROCK', 'passes'],
    ['AWS_REGION', 'passes'],
    ['AWS_ACCESS_KEY_ID', 'passes'],
    ['AWS_SECRET_ACCESS_KEY', 'passes'],
    ['AWS_SESSION_TOKEN', 'passes'],
    ['AWS_BEARER_TOKEN_BEDROCK', 'passes'],
    ['CLAUDE_CODE_USE_VERTEX', 'passes'],
    ['CLOUD_ML_REGION', 'passes'],
    ['ANTHROPIC_VERTEX_PROJECT_ID', 'passes'],
    ['GOOGLE_APPLICATION_CREDENTIALS', 'passes'],
    ['CLAUDE_CONFIG_DIR', 'passes'],
    ['ANTHROPIC_BASE_URL', 'dropped'],
    ['CLAUDECODE', 'dropped'],
    ['CLAUDE_CODE_SESSION_ID', 'dropped'],
    ['GITHUB_TOKEN', 'dropped'],
    ['GH_TOKEN', 'dropped'],
    ['NPM_TOKEN', 'dropped'],
    ['OPENAI_API_KEY', 'dropped'],
    ['DATABASE_URL', 'dropped'],
    ['SSH_AUTH_SOCK', 'dropped'],
    ['EXAMPLE_SECRET', 'dropped'],
  ];

  for (const [hostName, launchEnvironment] of [['macOS and Linux', POSIX_LAUNCH_ENVIRONMENT], ['Windows', WINDOWS_LAUNCH_ENVIRONMENT]] as const) {
    test.each(FORWARDING_TABLE)(`on ${hostName}, %s %s to the launched session`, (name, verdict) => {
      const inherited   = Object.fromEntries(FORWARDING_TABLE.map(([variableName]) => [variableName, `value-of-${variableName}`]));
      const environment = launchEnvironment.launchEnvironmentOf(inherited, {}, CLAUDE_CODE_ADAPTER.inheritedVariableNames);
      const plan        = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder', { environment }));
      expect(plan.environment[name]).toBe(verdict === 'passes' ? `value-of-${name}` : undefined);
    });
  }

  test('a gate, given no vendor variables, gets none of the login variables', () => {
    const environment = POSIX_LAUNCH_ENVIRONMENT.launchEnvironmentOf({ ANTHROPIC_API_KEY: 'example-key', CLAUDE_CONFIG_DIR: '/srv/claude-config' }, {});
    expect(environment).toEqual({});
  });

  test('turns signing off through the same triple only when no signing allowance works', () => {
    const profile = { ...profileOf('builder'), commitSigning: { kind: 'unsigned' } as const };
    const plan = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder', { profile }));
    expect(plan.environment).toMatchObject({ GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_2: 'commit.gpgsign', GIT_CONFIG_VALUE_2: 'false' });
    expect(settingsOf(plan).sandbox.network.allowUnixSockets).toBeUndefined();
  });
});

function replyFor(line: string, standingReplies: readonly StandingReply[]): string | null {
  const record = JSON.parse(line) as Record<string, unknown>;
  const valueAt = (path: string): unknown => path.split('.')
    .reduce<unknown>((value, key) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined), record);
  const reply = standingReplies.find((candidate) => Object.entries(candidate.whenAllEqual).every(([path, value]) => valueAt(path) === value)
    && !Object.entries(candidate.whenNoneEqual).some(([path, value]) => valueAt(path) === value));
  return reply === undefined ? null : reply.replyTemplate.replace('{{request_id}}', String(record['request_id']));
}

function fixtureLines(name: string): string[] {
  return readFileSync(join(FIXTURES_FOLDER, name), 'utf8').split('\n').filter((line) => line.length > 0);
}

describe('the standing reply', () => {
  const { standingReplies } = CLAUDE_CODE_ADAPTER.planOf(requestOf('builder'));

  test('denies a can_use_tool for any tool but AskUserQuestion, under its own request id', () => {
    const reply = replyFor('{"type":"control_request","request_id":"r-7","request":{"subtype":"can_use_tool","tool_name":"WebFetch","input":{}}}', standingReplies);
    expect(JSON.parse(reply ?? 'null')).toMatchObject({ type: 'control_response', response: { subtype: 'success', request_id: 'r-7', response: { behavior: 'deny' } } });
  });

  test('leaves the recorded AskUserQuestion request, and every other recorded line, unanswered', () => {
    const lines = fixtureLines('ask-user-question-live-answer.stdout.jsonl');
    expect(lines.map((line) => replyFor(line, standingReplies)).filter((reply) => reply !== null)).toEqual([]);
  });
});

const WINDOWS_STYLE_HOST_FACTS: AgentHostFacts = { ...POSIX_CLAUDE_HOST_FACTS, shellToolNames: ['PowerShell'], sandboxSettingsApply: false };
const SHELL_PROGRAM = /(^|[\\/])(cmd|sh|bash|zsh|dash|powershell|pwsh)(\.exe)?$/i;

describe('the program a plan spawns', () => {
  for (const [hostName, facts, programPath, confinement] of [
    ['macOS and Linux', POSIX_CLAUDE_HOST_FACTS, CLAUDE_PROGRAM_PATH, 'confined'],
    ['Windows', WINDOWS_STYLE_HOST_FACTS, 'C:\\Users\\example\\.local\\bin\\claude.exe', 'unconfined-by-design'],
  ] as const) {
    test(`on ${hostName} the argv starts with the resolved path and holds no shell program`, () => {
      const { argv } = createClaudeCodeAdapter(facts).planOf(requestOf('builder', { programPath, confinement }));
      expect(argv[0]).toBe(programPath);
      expect(argv.filter((word) => SHELL_PROGRAM.test(word))).toEqual([]);
    });
  }

  test('the adapter asks the resolver for claude, under the forbidden roots it is given', () => {
    const asked: unknown[] = [];
    const answer = { verdict: 'found', path: CLAUDE_PROGRAM_PATH } as const;
    const resolver: Parameters<AgentAdapter['programPathOf']>[0] = {
      absolutePathOf: (name, forbiddenRoots) => {
        asked.push([name, forbiddenRoots]);
        return answer;
      },
    };
    expect(CLAUDE_CODE_ADAPTER.programPathOf(resolver, [REPOSITORY])).toBe(answer);
    expect(asked).toEqual([['claude', [REPOSITORY]]]);
  });
});

describe('the lines a Watcher sends', () => {
  const recordedStdin = fixtureLines('ask-user-question-live-answer.stdin.jsonl');

  test('a chat line is the recorded user line, byte for byte', () => {
    const recordedFirstLine = recordedStdin[0] ?? '';
    const text = (JSON.parse(recordedFirstLine) as { message: { content: string } }).message.content;
    expect(CLAUDE_CODE_ADAPTER.chatLineOf(text)).toBe(recordedFirstLine);
  });

  test('an answer line is the recorded control_response allow with the question echoed and the answers keyed by question text', () => {
    const [question] = CLAUDE_CODE_ADAPTER.eventsOf(fixtureLines('ask-user-question-live-answer.stdout.jsonl').find((line) => line.includes('"can_use_tool"')) ?? '');
    if (question?.kind !== 'question') throw new Error('the fixture holds no question');
    const answerLine = CLAUDE_CODE_ADAPTER.answerLineOf(question.requestId, question.questions, { 'Which colour should the button be?': 'Blue' });
    expect(JSON.parse(answerLine)).toEqual(JSON.parse(recordedStdin[1] ?? ''));
  });

  test('an interrupt is a control_request of subtype interrupt', () => {
    expect(JSON.parse(CLAUDE_CODE_ADAPTER.interruptLineOf())).toMatchObject({ type: 'control_request', request: { subtype: 'interrupt' } });
  });
});
