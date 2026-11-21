/**
 * The settings file each of the six session kinds launches with, rendered from its worker profile on each OS. What matters: on Windows no
 * session carries a `sandbox` key, so no `failIfUnavailable` and no `autoAllowBashIfSandboxed`, since Claude Code exits at startup there
 * when the sandbox must run; on macOS and Linux every session keeps its sandbox with `failIfUnavailable: true`, byte for byte as
 * `testing/fixtures/frozen-session-settings.json` holds. Its `profiles` are the six kinds' profiles as `src/services/hephaestus/` built them
 * (`WorkerProfiles.profileOf`, the product owner's through `IntakeSessions.productOwnerProfileOf`, the pipeline agent's through
 * `PipelineAgentSessions.pipelineAgentProfileOf`); its `settings` were rendered from them with the code before Windows sessions ran unconfined. Retake
 * the settings only from such code, rendering these same requests and writing each settings object under its key.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentLaunchRequest } from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }      from '../agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }    from './ClaudeCodeAdapter.ts';

interface FrozenSessionSettings {
  profiles: Record<string, WorkerProfile>;
  settings: Record<string, unknown>;
}

const FROZEN_SESSION_SETTINGS_PATH = join(import.meta.dir, 'testing', 'fixtures', 'frozen-session-settings.json');
const FROZEN = JSON.parse(readFileSync(FROZEN_SESSION_SETTINGS_PATH, 'utf8')) as FrozenSessionSettings;

const HOME = '/example/home/alex-example';
const WORKTREE = '/example/repository/.example-worktrees/ticket-007';
const JOB_FILES = '/example/repository/.example-data/jobs/J4';

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
    expect(Object.keys(FROZEN.profiles).sort()).toEqual(['airlock-agent', 'assistant', 'builder', 'pipeline-agent', 'product-owner', 'reviewer']);
  });

  for (const [kind, profile] of Object.entries(FROZEN.profiles)) {
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
    for (const [kind, profile] of Object.entries(FROZEN.profiles)) {
      test(`${platform} ${kind}: equal the frozen settings, the sandbox failing if unavailable`, () => {
        const settings = renderedSettingsOf(platform, profile);
        expect(settings).toMatchObject({ sandbox: { enabled: true, failIfUnavailable: true } });
        expect(JSON.stringify(settings, null, 2)).toBe(JSON.stringify(FROZEN.settings[`${platform} ${kind}`], null, 2));
      });
    }
  }
});

describe('a session with no tool', () => {
  const profile: WorkerProfile = { ...FROZEN.profiles['assistant'] as WorkerProfile, availableTools: 'none' };

  for (const platform of ['darwin', 'linux']) {
    test(`${platform}: gets an empty tool list and no allow rule, and keeps its sandbox`, () => {
      const plan = claudeCodeAdapterFor(platform).planOf(requestOf(platform, profile));
      const toolsIndex = plan.argv.indexOf('--tools');
      expect(toolsIndex).toBeGreaterThan(0);
      expect(plan.argv[toolsIndex + 1]).toBe('');
      expect(renderedSettingsOf(platform, profile)).toMatchObject({ permissions: { allow: [] }, sandbox: { enabled: true, failIfUnavailable: true } });
    });
  }

  test('a session with tools gets no tool list', () => {
    expect(claudeCodeAdapterFor('darwin').planOf(requestOf('darwin', FROZEN.profiles['assistant'] as WorkerProfile)).argv).not.toContain('--tools');
  });
});
