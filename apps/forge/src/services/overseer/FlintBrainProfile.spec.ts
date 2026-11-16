/**
 * The brain's launch request. What matters: the session asks for no tool at all, which the adapter renders as an empty tool list under the
 * sandbox (`src/lib/claude-code/ClaudeCodeAdapter.sessionKinds.spec.ts`); it runs Haiku at low effort with the answer schema, a fresh
 * session per run; no instruction file or rule above its working folder reaches it; and the brain runs only where a worker session runs
 * confined and the no-flint test setting is off.
 */
import { describe, expect, test } from 'bun:test';

import { fakeAgentAdapter }                              from '../../testing/FakeAgentAdapter.ts';
import { type FlintBrainLaunchFacts, FlintBrainProfile } from './FlintBrainProfile.ts';
import { FLINT_BRAIN_ANSWER_SCHEMA }                     from './utils/FlintBrainDigestUtil.ts';

const LAUNCH_FACTS: FlintBrainLaunchFacts = {
  platformPorts: {
    executableResolver: { absolutePathOf: () => ({ verdict: 'found', path: '/usr/local/bin/claude' }) },
    launchEnvironment:  { launchEnvironmentOf: () => ({ PATH: '/usr/bin' }), searchFoldersOf: () => [], inheritedVariableNames: [] },
    gateConfinement:    { availability: () => ({ verdict: 'confined', mechanism: 'sandbox-exec' }), workerConfinement: () => 'confined', confinedArgvOf: (_plan, argv) => argv },
  },
  inheritedEnvironment:   {},
  repositoryRoot:         '/scratch/repository',
  trackerId:              'tracker-example',
  homeDirectory:          '/scratch/home',
  brainIsWithheld:        false,
  maximumRunMilliseconds: 1000,
};

const PLACE = { run: 3, workingDirectory: '/scratch/repository/.forge/flint-brain/session', jobFilesDirectory: '/scratch/repository/.forge/flint-brain/run-3' };

function brainRequest() {
  return FlintBrainProfile.launchRequestOf(fakeAgentAdapter(), LAUNCH_FACTS, PLACE, '/usr/local/bin/claude', '2026-11-16T10:00:00.000Z');
}

describe('the brain\'s launch', () => {
  test('asks for no tool, no allow, no question and no skill, confined, writing nowhere but its working folder', () => {
    const { profile, confinement } = brainRequest();
    expect(profile).toMatchObject({
      availableTools: 'none', writableRoots: [], allowedCommandPrefixes: [], webNetworkDomains: 'none', askUser: false, skills: false, subagents: []
    });
    expect(profile.extraWritableDirectory).toBe(PLACE.workingDirectory);
    expect(confinement).toBe('confined');
  });

  test('runs Haiku at low effort, a fresh session answering by the schema', () => {
    const request = brainRequest();
    expect(request).toMatchObject({ model: 'haiku', effort: 'low', resume: false });
    expect(request.reportSchema).toBe(FLINT_BRAIN_ANSWER_SCHEMA);
  });

  test('keeps out the instruction files and rules of every folder above its working folder', () => {
    const { profile } = brainRequest();
    expect(profile.instructionsRoot).toBe(PLACE.workingDirectory);
    expect(profile.nestedCheckoutAncestors).toEqual(['/scratch/repository/.forge/flint-brain', '/scratch/repository/.forge', '/scratch/repository', '/scratch', '/']);
  });

  test('a run of another start is another session', () => {
    const adapter = fakeAgentAdapter();
    const first = FlintBrainProfile.launchRequestOf(adapter, LAUNCH_FACTS, PLACE, '/usr/local/bin/claude', '2026-11-16T10:00:00.000Z');
    const second = FlintBrainProfile.launchRequestOf(adapter, LAUNCH_FACTS, PLACE, '/usr/local/bin/claude', '2026-11-16T10:05:00.000Z');
    expect(first.sessionId).not.toBe(second.sessionId);
  });
});

describe('where the brain runs', () => {
  test('only where a worker session runs confined, and not under the no-flint test setting', () => {
    expect(FlintBrainProfile.brainCanRun(LAUNCH_FACTS)).toBe(true);
    expect(FlintBrainProfile.brainCanRun({ ...LAUNCH_FACTS, brainIsWithheld: true })).toBe(false);
    const gateConfinement = { ...LAUNCH_FACTS.platformPorts.gateConfinement, workerConfinement: () => 'unconfined-by-design' as const };
    const unconfined = { ...LAUNCH_FACTS.platformPorts, gateConfinement };
    expect(FlintBrainProfile.brainCanRun({ ...LAUNCH_FACTS, platformPorts: unconfined })).toBe(false);
  });
});
