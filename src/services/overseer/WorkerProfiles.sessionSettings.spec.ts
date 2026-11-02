/**
 * The settings file each of the six session kinds launches with, rendered by the Claude Code adapter from its worker profile on each OS.
 * What matters: on Windows no session carries a `sandbox` key, so no `failIfUnavailable` and no `autoAllowBashIfSandboxed`, since
 * Claude Code exits at startup there when the sandbox must run; on macOS and Linux every session keeps its sandbox with
 * `failIfUnavailable: true`, byte for byte as `FrozenSessionSettings.json` holds. That table was taken with the code before Windows
 * sessions ran unconfined; retake it only from such code, rendering these same requests and writing each settings object under its key.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentLaunchRequest } from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }      from '../../lib/agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }    from '../../lib/claude-code/ClaudeCodeAdapter.ts';
import { dataFoldersFor }          from '../../lib/data-folders/DataFoldersFor.ts';
import { IntakeSessions }          from './IntakeSessions.ts';
import { Onboarding }              from './Onboarding.ts';
import {
  NO_TOOLCHAIN,
  type ProfiledRole,
  type SandboxFacts,
  WorkerProfiles
} from './WorkerProfiles.ts';

const FROZEN_SESSION_SETTINGS_PATH = join(import.meta.dir, 'FrozenSessionSettings.json');
const FROZEN_SESSION_SETTINGS = JSON.parse(readFileSync(FROZEN_SESSION_SETTINGS_PATH, 'utf8')) as Record<string, unknown>;

const HOME = '/example/home/alex-example';
const REPOSITORY = '/example/repository';
const WORKTREE = `${REPOSITORY}/.example-worktrees/ticket-007`;
const HATCH = `${REPOSITORY}/.example-worktrees/hatch/J4`;
const JOB_FILES = `${REPOSITORY}/.example-data/jobs/J4`;

const FACTS: SandboxFacts = {
  dataFolder:                `${REPOSITORY}/.example-data`,
  monitorFolder:             `${HOME}/.example-monitor`,
  homeDirectory:             HOME,
  worktree:                  WORKTREE,
  commonGitDirectory:        `${REPOSITORY}/.git`,
  targetBranches:            ['main'],
  otherTicketBranches:       ['ticket-003'],
  otherWorktreeAdminFolders: [`${REPOSITORY}/.git/worktrees/ticket-003`],
  hatchDirectory:            HATCH,
  repositoryRoot:            REPOSITORY,
  gitHooksDirectory:         `${REPOSITORY}/.githooks`,
  commitSigning:             { kind: 'unsigned' },
  credentialPaths:           [`${HOME}/.ssh`],
  gpgHomeDirectory:          `${HOME}/.gnupg`,
  executableSearchPath:      [],
  cacheFolderStyle:          dataFoldersFor('linux', ''),
  sandboxDenyShape:          'path-rules',
  guardProgramPath:          '/example/bin/example-program',
};

const TOOLCHAIN = { networkDomains: ['registry.example.com'], writes: [], executables: ['bun'] };

function roleProfileOf(role: ProfiledRole): WorkerProfile {
  return WorkerProfiles.profileOf(role, FACTS, role === 'resolver' ? NO_TOOLCHAIN : TOOLCHAIN);
}

const SESSION_PROFILES: Readonly<Record<string, WorkerProfile>> = {
  'builder':       roleProfileOf('builder'),
  'reviewer':      roleProfileOf('reviewer'),
  'resolver':      roleProfileOf('resolver'),
  'product-owner': IntakeSessions.productOwnerProfileOf(roleProfileOf('product-owner')),
  'assistant':     roleProfileOf('assistant'),
  'onboarder':     Onboarding.onboarderProfileOf(roleProfileOf('assistant'), HATCH),
};

function requestOf(platform: string, profile: WorkerProfile): AgentLaunchRequest {
  return {
    confinement:       platform === 'win32' ? 'unconfined-by-design' : 'confined',
    programPath:       '/example/bin/claude',
    sessionId:         'session-example',
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     HOME,
    firstMessage:      'Work.',
    roleBrief:         'A session.',
    model:             'opus',
    effort:            'medium',
    environment:       {},
    profile,
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
}

function renderedSettingsOf(platform: string, profile: WorkerProfile): Record<string, unknown> {
  const settings = claudeCodeAdapterFor(platform).planOf(requestOf(platform, profile)).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  return JSON.parse(settings?.text ?? '{}') as Record<string, unknown>;
}

describe('the Windows settings of every session kind', () => {
  test('cover the six session kinds', () => {
    expect(Object.keys(SESSION_PROFILES)).toHaveLength(6);
  });

  for (const [kind, profile] of Object.entries(SESSION_PROFILES)) {
    test(`${kind}: no sandbox key, so neither failIfUnavailable nor autoAllowBashIfSandboxed`, () => {
      const text = JSON.stringify(renderedSettingsOf('win32', profile));
      expect(text).toContain('"permissions"');
      expect(text).not.toContain('"sandbox"');
      expect(text).not.toContain('failIfUnavailable');
      expect(text).not.toContain('autoAllowBashIfSandboxed');
    });
  }
});

describe('the macOS and Linux settings of every session kind', () => {
  for (const platform of ['darwin', 'linux']) {
    for (const [kind, profile] of Object.entries(SESSION_PROFILES)) {
      test(`${platform} ${kind}: equal the frozen settings, the sandbox failing if unavailable`, () => {
        const settings = renderedSettingsOf(platform, profile);
        expect(settings).toMatchObject({ sandbox: { enabled: true, failIfUnavailable: true } });
        expect(JSON.stringify(settings, null, 2)).toBe(JSON.stringify(FROZEN_SESSION_SETTINGS[`${platform} ${kind}`], null, 2));
      });
    }
  }
});
