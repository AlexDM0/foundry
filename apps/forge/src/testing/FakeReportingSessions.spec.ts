/**
 * A scratch board runs a ticket to its landing only when every fake session reports what its stage's Customs checks: a report its schema
 * takes, every Acceptance item accounted for where the stage answers for it, and a commit in each folder the stage may change, so a stage 1
 * that may write a package's proposal crosses into it. A Brief whose `Work belongs in:` line names folders keeps the commit to those, so a
 * ticket of an app with several whitelisted packages crosses only into the ones it names, a resumed session too. A package build states no
 * change of what the package exposes and its review confirms it, so the adapt stage is skipped. A resumed session, told no ticket, still
 * names the items. Each line it prints must be a recorded `claude` line, and a session no reporting role answers plays the adapter's own
 * steps.
 */
import { describe, expect, test } from 'bun:test';

import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../adapters/reports/ReportSchemas.ts';
import { type JsonSchema, reportVerdictOf }           from '../adapters/reports/ReportValidation.ts';
import type { AgentLaunchRequest }                    from '../lib/agent-launch/AgentLaunchRequest.ts';
import { JOB_ID_VARIABLE }                            from '../shared/Environment.ts';
import { FAKE_HEAD_PLACEHOLDER, type FakeAgentStep }  from './FakeAgentAdapter.ts';
import { FAKE_WORK_FILE_NAME, fakeReportingSessions } from './FakeReportingSessions.ts';
import { recordedLineOf }                             from './fake-agent/RecordedClaudeLines.ts';

const WORKTREE = '/scratch/example-agency/.forge/worktrees/ticket-001';

const TICKET_MESSAGE = [
  'Build ticket #001.',
  '',
  '## Brief',
  '',
  'Show the basket total with the shared price label.',
  '',
  '## Acceptance',
  '',
  'A1. The basket shows its total.',
  'A2. The price label shows the currency.',
].join('\n');

const TICKET_MESSAGE_WITH_WORK_FILES = TICKET_MESSAGE.replace(
  'Show the basket total with the shared price label.',
  'Show the basket total with the shared price label.\n\nWork belongs in: `apps/shop/`, `packages/ui-kit/PriceLabel.ts`'
);

const STAGE_FOLDERS_OF_A_WIDE_WHITELIST = [`${WORKTREE}/apps/shop`, `${WORKTREE}/packages/ui-kit`, `${WORKTREE}/packages/icons`];

function requestOf(reportSchema: JsonSchema | null, overrides: Partial<AgentLaunchRequest> = {}): AgentLaunchRequest {
  return {
    programPath:       '/usr/local/bin/bun',
    sessionId:         'fake-tracker-J3',
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     '/scratch/home',
    firstMessage:      TICKET_MESSAGE,
    roleBrief:         '',
    model:             'opus',
    effort:            'medium',
    environment:       { [JOB_ID_VARIABLE]: 'J3' },
    jobFilesDirectory: '/scratch/example-agency/.forge/jobs/J3',
    reportSchema,
    confinement:       'confined',
    profile:           {
      writableRoots:          [],
      deniedWritableRoots:    [],
      deniedReadableRoots:    [],
      bashNetworkDomains:     [],
      webNetworkDomains:      'none',
      extraWritableDirectory: WORKTREE,
      allowedCommandPrefixes: [],
      deniedCommandPrefixes:  [],
      askUser:                true,
      skills:                 false,
      subagents:              [],
      attribution:            'none',
      instructionsRoot:       WORKTREE,
      gitHooksDirectory:      WORKTREE,
      commitSigning:          { kind: 'unsigned' },
      networkDomainGuard:     null,
      stageFolders:           [`${WORKTREE}/apps/shop`, `${WORKTREE}/packages/ui-kit`],
    },
    ...overrides,
  };
}

function stepsOf(request: AgentLaunchRequest): readonly FakeAgentStep[] {
  const steps = fakeReportingSessions().stepsOf(request);
  if (steps === null) throw new Error('The fake planned no reporting session.');
  return steps;
}

function reportOf(steps: readonly FakeAgentStep[]): Record<string, unknown> {
  const resultLines = steps.flatMap((step) => (step.kind === 'print' && step.line.includes('"result"') ? [step.line] : []));
  expect(resultLines).toHaveLength(1);
  return (JSON.parse(resultLines[0] ?? '{}') as { structured_output: Record<string, unknown> }).structured_output;
}

function reportWithHeadOf(report: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(report).replaceAll(FAKE_HEAD_PLACEHOLDER, 'a'.repeat(40))) as Record<string, unknown>;
}

function shellCommandsOf(steps: readonly FakeAgentStep[]): string[] {
  return steps.flatMap((step) => (step.kind === 'shell' ? [step.command] : []));
}

describe('a fake reporting session', () => {
  test.each([
    ['a build', BUILDER_REPORT_SCHEMA],
    ['a package build', PACKAGE_BUILDER_REPORT_SCHEMA],
    ['an adapt build', ADAPT_BUILDER_REPORT_SCHEMA],
    ['a review', REVIEWER_REPORT_SCHEMA],
    ['a package review', PACKAGE_REVIEWER_REPORT_SCHEMA],
  ])('reports %s by the schema its launch hands it, in recorded claude lines', (_stage, schema) => {
    const steps = stepsOf(requestOf(schema));
    expect(reportVerdictOf(schema, reportWithHeadOf(reportOf(steps)))).toEqual({ verdict: 'valid' });
    for (const step of steps) if (step.kind === 'print') expect(() => recordedLineOf(step.line)).not.toThrow();
  });

  test('a builder appends to the work file in each folder its stage may change, a package proposal among them, and commits them alone', () => {
    const [command] = shellCommandsOf(stepsOf(requestOf(BUILDER_REPORT_SCHEMA)));
    expect(command).toContain(`'${WORKTREE}/apps/shop'/${FAKE_WORK_FILE_NAME}`);
    expect(command).toContain(`git add -- '${WORKTREE}/packages/ui-kit'/${FAKE_WORK_FILE_NAME}`);
    expect(command).toContain('commit -q -m \'Do the work of job J3\'');
    expect(command).not.toContain('add -A');
  });

  test('a builder whose Brief names its work files appends only in the folders they name, so it crosses only into the named package', () => {
    const request = requestOf(BUILDER_REPORT_SCHEMA, { firstMessage: TICKET_MESSAGE_WITH_WORK_FILES });
    const [command] = shellCommandsOf(stepsOf({ ...request, profile: { ...request.profile, stageFolders: STAGE_FOLDERS_OF_A_WIDE_WHITELIST } }));
    expect(command).toContain(`git add -- '${WORKTREE}/apps/shop'/${FAKE_WORK_FILE_NAME}`);
    expect(command).toContain(`git add -- '${WORKTREE}/packages/ui-kit'/${FAKE_WORK_FILE_NAME}`);
    expect(command).not.toContain(`'${WORKTREE}/packages/icons'`);
  });

  test('a resumed builder told no ticket keeps to the folders its first launch read', () => {
    const sessions = fakeReportingSessions();
    const request = requestOf(BUILDER_REPORT_SCHEMA, { firstMessage: TICKET_MESSAGE_WITH_WORK_FILES });
    const wideRequest = { ...request, profile: { ...request.profile, stageFolders: STAGE_FOLDERS_OF_A_WIDE_WHITELIST } };
    sessions.stepsOf(wideRequest);
    const [command] = shellCommandsOf(sessions.stepsOf({ ...wideRequest, resume: true, firstMessage: 'Carry on with your work.' }) ?? []);
    expect(command).not.toContain(`'${WORKTREE}/packages/icons'`);
  });

  test('a builder whose work files name none of its folders appends in each of them', () => {
    const request = requestOf(BUILDER_REPORT_SCHEMA, { firstMessage: TICKET_MESSAGE.replace('price label.', 'price label.\n\nWork belongs in: `apps/admin/`') });
    const [command] = shellCommandsOf(stepsOf(request));
    expect(command).toContain(`'${WORKTREE}/apps/shop'/${FAKE_WORK_FILE_NAME}`);
    expect(command).toContain(`'${WORKTREE}/packages/ui-kit'/${FAKE_WORK_FILE_NAME}`);
  });

  test('a builder of a job with no stage folders works in its working directory', () => {
    const request = requestOf(BUILDER_REPORT_SCHEMA);
    const { stageFolders: _stageFolders, ...profileWithoutStageFolders } = request.profile;
    const [command] = shellCommandsOf(stepsOf({ ...request, profile: profileWithoutStageFolders }));
    expect(command).toContain(`'${WORKTREE}'/${FAKE_WORK_FILE_NAME}`);
  });

  test('a build and a review account for every Acceptance item; a package build accounts for none', () => {
    expect(reportOf(stepsOf(requestOf(BUILDER_REPORT_SCHEMA)))['acceptance']).toMatchObject([{ item: 'A1', state: 'met' }, { item: 'A2', state: 'met' }]);
    expect(reportOf(stepsOf(requestOf(REVIEWER_REPORT_SCHEMA)))['claims']).toMatchObject([{ item: 'A1', result: 'holds' }, { item: 'A2', result: 'holds' }]);
    expect(reportOf(stepsOf(requestOf(PACKAGE_BUILDER_REPORT_SCHEMA)))['acceptance']).toEqual([]);
  });

  test('a package build states that what the package exposes did not change, and its review confirms it, so adapt is skipped', () => {
    expect(reportOf(stepsOf(requestOf(PACKAGE_BUILDER_REPORT_SCHEMA)))).toMatchObject({ outcome: 'built', exposedSurfaceChanged: false });
    expect(reportOf(stepsOf(requestOf(PACKAGE_REVIEWER_REPORT_SCHEMA)))).toMatchObject({ exposedSurfaceConfirmed: true, findings: [] });
  });

  test('a reviewer commits nothing', () => {
    expect(shellCommandsOf(stepsOf(requestOf(REVIEWER_REPORT_SCHEMA)))).toEqual([]);
    expect(shellCommandsOf(stepsOf(requestOf(PACKAGE_REVIEWER_REPORT_SCHEMA)))).toEqual([]);
  });

  test('a resumed session told no ticket reports the Acceptance items its first launch read', () => {
    const sessions = fakeReportingSessions();
    sessions.stepsOf(requestOf(BUILDER_REPORT_SCHEMA));
    const resumed = sessions.stepsOf(requestOf(BUILDER_REPORT_SCHEMA, { resume: true, firstMessage: 'Carry on with your work.' }));
    expect(reportOf(resumed ?? [])['acceptance']).toMatchObject([{ item: 'A1' }, { item: 'A2' }]);
  });

  test('a session with no report, or an Airlock agent, plays the adapter\'s own steps', () => {
    expect(fakeReportingSessions().stepsOf(requestOf(null))).toBeNull();
    expect(fakeReportingSessions().stepsOf(requestOf(AIRLOCK_AGENT_REPORT_SCHEMA))).toBeNull();
  });
});
