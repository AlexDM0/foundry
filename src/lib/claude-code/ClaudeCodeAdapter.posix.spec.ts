/**
 * The macOS and Linux settings and agents files may change only by the PowerShell rules and tools and by the exec-form guard hook. This
 * renders a guarded and an unguarded builder on both, takes those two changes back out, and compares the text byte for byte with
 * `testing/fixtures/frozen-posix-settings.json`, taken with the code before the PowerShell rules existed. Retake it only from such code,
 * with these same requests, the guard then given as one `commandArgv` of the program path and its arguments.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { expect, test } from 'bun:test';

import { settingsTextBeforePowerShell } from '../../testing/SettingsBeforePowerShell.ts';
import type { AgentLaunchRequest }      from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }           from '../agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }         from './ClaudeCodeAdapter.ts';

const FROZEN_POSIX_SETTINGS_PATH = join(import.meta.dir, 'testing', 'fixtures', 'frozen-posix-settings.json');
const FROZEN_POSIX_SETTINGS = JSON.parse(readFileSync(FROZEN_POSIX_SETTINGS_PATH, 'utf8')) as Record<string, Record<string, string>>;

const REPOSITORY = '/home/alex-example/example-repository';
const WORKTREE = `${REPOSITORY}/.example-worktrees/ticket-7`;
const JOB_FILES = `${REPOSITORY}/.example-data/jobs/J1`;
const GUARD_PROGRAM_PATH = '/home/alex-example/.bun/bin/example-program';
const GUARD_ARGUMENTS = ['hook', 'bash-domains', '--allow', 'registry.example.com,*.docs.example.org'];
/** The shell-form command the frozen table holds, the comma list single-quoted against globbing. */
const FROZEN_GUARD_COMMAND = `${GUARD_PROGRAM_PATH} hook bash-domains --allow 'registry.example.com,*.docs.example.org'`;
const POWERSHELL_PREFIX = 'PowerShell';

function profileOf(guarded: boolean): WorkerProfile {
  return {
    writableRoots:          [`${REPOSITORY}/.example-cache`],
    deniedWritableRoots:    [`${REPOSITORY}/.example-data`, `${WORKTREE}/.claude`],
    deniedReadableRoots:    ['/home/alex-example/.ssh'],
    bashNetworkDomains:     guarded ? ['registry.example.com'] : [],
    webNetworkDomains:      guarded ? ['registry.example.com'] : 'none',
    hatchDirectory:         `${REPOSITORY}/.example-worktrees/hatch/J1`,
    allowedCommandPrefixes: [['bun', 'run', 'verify'], ['git', 'commit']],
    deniedCommandPrefixes:  [['git', 'push'], ['git', 'rebase']],
    askUser:                true,
    skills:                 false,
    subagents:              [{
      name: 'coder', model: 'opus', effort: 'medium', readOnly: false
    }, {
      name: 'explorer', model: 'haiku', effort: 'low', readOnly: true
    }],
    attribution:        'none',
    instructionsRoot:   REPOSITORY,
    gitHooksDirectory:  `${REPOSITORY}/.githooks`,
    commitSigning:      { kind: 'unsigned' },
    networkDomainGuard: guarded
      ? { allowedDomains: ['registry.example.com', '*.docs.example.org'], programPath: GUARD_PROGRAM_PATH, arguments: GUARD_ARGUMENTS }
      : null,
  };
}

function requestOf(guarded: boolean): AgentLaunchRequest {
  return {
    programPath:       '/home/alex-example/.local/bin/claude',
    sessionId:         'session-example',
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     '/home/alex-example',
    firstMessage:      'Build.',
    roleBrief:         'Builder.',
    model:             'opus',
    effort:            'medium',
    environment:       {},
    profile:           profileOf(guarded),
    confinement:       'confined',
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
}

test('the guard hook written back is the frozen shell-form command, the comma list single-quoted against globbing', () => {
  const settings = claudeCodeAdapterFor('darwin').planOf(requestOf(true)).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  expect(settingsTextBeforePowerShell(settings?.text ?? '{}')).toContain(JSON.stringify(FROZEN_GUARD_COMMAND));
});

const BUN_RUNTIME_PATH = '/home/alex-example/.bun/bin/bun';
const BUN_LEADING_ARGUMENTS = ['--no-env-file', '--config=/home/alex-example/example-tool/bunfig.toml', '/home/alex-example/example-tool/agent-progress.ts'];

function settingsWithGuard(platform: string, programPath: string, guardArguments: readonly string[]): { hooks?: unknown; permissions: { deny: string[] } } {
  const guard = { allowedDomains: ['registry.example.com'], programPath, arguments: guardArguments };
  const request = { ...requestOf(true), profile: { ...profileOf(true), networkDomainGuard: guard } };
  const settings = claudeCodeAdapterFor(platform).planOf(request).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  return JSON.parse(settings?.text ?? '{}') as { hooks?: unknown; permissions: { deny: string[] } };
}

for (const platform of ['darwin', 'linux']) {
  test(`${platform}: the Bun-run guard names the runtime by its absolute path, then the isolating arguments and the entry script, and no part is env or a bare name`, () => {
    const settings = settingsWithGuard(platform, BUN_RUNTIME_PATH, [...BUN_LEADING_ARGUMENTS, ...GUARD_ARGUMENTS]);
    const { PreToolUse } = settings.hooks as { PreToolUse: { hooks: { command: string; args: string[] }[] }[] };
    for (const { command, args } of PreToolUse.flatMap((entry) => entry.hooks)) {
      expect(command).toBe(BUN_RUNTIME_PATH);
      expect(args).toEqual([...BUN_LEADING_ARGUMENTS, ...GUARD_ARGUMENTS]);
      expect([command, ...args].some((part) => part === 'env' || part.endsWith('/env'))).toBe(false);
    }
  });

  test(`${platform}: a guard named by a bare program name renders no hook and denies Bash, PowerShell and WebFetch, as one that cannot start`, () => {
    const settings = settingsWithGuard(platform, 'agent-progress', GUARD_ARGUMENTS);
    expect(settings.hooks).toBeUndefined();
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['Bash', 'PowerShell', 'WebFetch']));
  });
}

const CASES = ['darwin', 'linux'].flatMap((platform) => [true, false].map((guarded) => ({
  platform,
  key: `${platform} ${guarded ? 'guarded' : 'unguarded'}`,
  guarded,
})));

for (const { platform, key, guarded } of CASES) {
  test(`${key}: the settings and agents files differ from the frozen text only by PowerShell and the exec-form hook`, () => {
    const plan = claudeCodeAdapterFor(platform).planOf(requestOf(guarded));
    const frozen = FROZEN_POSIX_SETTINGS[key];
    for (const fileName of ['settings.json', 'agents.json']) {
      const text = plan.files.find((file) => file.path === join(JOB_FILES, fileName))?.text ?? '';
      expect(text).toContain(POWERSHELL_PREFIX);
      expect(settingsTextBeforePowerShell(text)).toBe(frozen?.[fileName] ?? '');
    }
  });
}
