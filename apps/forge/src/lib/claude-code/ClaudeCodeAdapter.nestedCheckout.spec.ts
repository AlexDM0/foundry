/**
 * A session started in a project folder of a checkout nested in the main checkout. Its Edit and Write rules reach the profile's write root,
 * the whole checkout, rather than the folder it starts in; and `claudeMdExcludes` names the main checkout's instruction files and rules
 * above the checkout, which Claude Code's upward walk would read beside the checkout's own copies, a rules folder by a glob of its files
 * since a bare folder excludes nothing. A profile without either key renders as it always did.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentLaunchRequest } from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }      from '../agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }    from './ClaudeCodeAdapter.ts';

const HOME = '/home/alex-example';
const REPOSITORY = `${HOME}/example-repository`;
const PROJECT = `${REPOSITORY}/apps/example`;
const CHECKOUT = `${PROJECT}/.example-worktrees/ticket-7`;
const WORKING_DIRECTORY = `${CHECKOUT}/apps/example`;
const JOB_FILES = `${PROJECT}/.example-data/jobs/J1`;
const NESTED_CHECKOUT_ANCESTORS = [`${PROJECT}/.example-worktrees`, PROJECT, `${REPOSITORY}/apps`, REPOSITORY];

const ROOT_TRACKER_PROFILE: WorkerProfile = {
  writableRoots:          [],
  deniedWritableRoots:    [`${PROJECT}/.example-data`],
  deniedReadableRoots:    [`${HOME}/.ssh`],
  shellNetworkDomains:    [],
  webNetworkDomains:      'none',
  extraWritableDirectory: `${PROJECT}/.example-worktrees/hatch/J1`,
  allowedCommandPrefixes: [['git', 'commit']],
  deniedCommandPrefixes:  [['git', 'push']],
  askUser:                true,
  skills:                 false,
  subagents:              [],
  attribution:            'none',
  instructionsRoot:       REPOSITORY,
  gitHooksDirectory:      `${REPOSITORY}/.githooks`,
  commitSigning:          { kind: 'unsigned' },
  networkDomainGuard:     null,
};

const NESTED_PROFILE: WorkerProfile = {
  ...ROOT_TRACKER_PROFILE, writableRoots: [CHECKOUT], writeRoot: CHECKOUT, nestedCheckoutAncestors: NESTED_CHECKOUT_ANCESTORS
};

interface RenderedSettings {
  claudeMdExcludes: string[];
  permissions:      { allow: string[] };
  sandbox:          { filesystem: { allowWrite: string[] } };
}

function settingsOf(profile: WorkerProfile, workingDirectory: string): RenderedSettings {
  const request: AgentLaunchRequest = {
    programPath:       `${HOME}/.local/bin/claude`,
    sessionId:         'session-example',
    resume:            false,
    workingDirectory,
    homeDirectory:     HOME,
    firstMessage:      'Build.',
    roleBrief:         'Builder.',
    model:             'opus',
    effort:            'medium',
    environment:       {},
    profile,
    confinement:       'confined',
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
  const settings = claudeCodeAdapterFor('linux').planOf(request).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  return JSON.parse(settings?.text ?? '{}') as RenderedSettings;
}

describe('a profile with no write root and no nested checkout', () => {
  test('lets Edit and Write reach the working directory and excludes only the files above the repository', () => {
    const settings = settingsOf(ROOT_TRACKER_PROFILE, CHECKOUT);
    expect(settings.permissions.allow).toContain(`Edit(/${CHECKOUT}/**)`);
    expect(settings.permissions.allow).toContain(`Write(/${CHECKOUT}/**)`);
    expect(settings.claudeMdExcludes.filter((path) => path.startsWith(`${REPOSITORY}/`))).toEqual([]);
    expect(settings.claudeMdExcludes.some((path) => path.includes('rules'))).toBe(false);
  });
});

describe('a session in the project folder of a nested checkout', () => {
  test('lets Edit and Write reach the whole checkout, never only the folder it starts in', () => {
    const { permissions } = settingsOf(NESTED_PROFILE, WORKING_DIRECTORY);
    expect(permissions.allow).toContain(`Edit(/${CHECKOUT}/**)`);
    expect(permissions.allow).toContain(`Write(/${CHECKOUT}/**)`);
    expect(permissions.allow.some((rule) => rule.includes(WORKING_DIRECTORY))).toBe(false);
  });

  test('lets the sandbox write the whole checkout', () => {
    expect(settingsOf(NESTED_PROFILE, WORKING_DIRECTORY).sandbox.filesystem.allowWrite).toContain(`/${CHECKOUT}`);
  });

  test('excludes the main checkout\'s instruction files and rules in every folder above the checkout', () => {
    const { claudeMdExcludes } = settingsOf(NESTED_PROFILE, WORKING_DIRECTORY);
    for (const folder of NESTED_CHECKOUT_ANCESTORS) {
      expect(claudeMdExcludes).toEqual(expect.arrayContaining([
        `${folder}/CLAUDE.md`, `${folder}/CLAUDE.local.md`, `${folder}/.claude/CLAUDE.md`, `${folder}/.claude/rules/**`,
      ]));
    }
  });

  test('excludes nothing inside the checkout, whose own files the session reads', () => {
    expect(settingsOf(NESTED_PROFILE, WORKING_DIRECTORY).claudeMdExcludes.filter((path) => path.startsWith(`${CHECKOUT}/`))).toEqual([]);
  });

  test('still excludes the files above the repository, as for every session', () => {
    expect(settingsOf(NESTED_PROFILE, WORKING_DIRECTORY).claudeMdExcludes).toContain(`${HOME}/CLAUDE.md`);
  });
});
