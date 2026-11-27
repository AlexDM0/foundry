/**
 * A session's confinement as its agent adapter declares it. What matters: an agent that applies the profile itself is never wrapped in
 * forge's confinement too, since a nested Seatbelt profile is refused; for an agent with no sandbox of its own, the plan of each role's
 * profile writes the checkout, the profile's other roots, its one extra folder and the agent's own folders, keeps every deny of the
 * profile and gives the network whole; a profile with network domains and an unavailable port are refused, and Windows runs unwrapped.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentAdapter }                                                  from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                                            from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                                                 from '../../lib/agent-launch/WorkerProfile.ts';
import { dataFoldersFor }                                                     from '../../lib/data-folders/DataFoldersFor.ts';
import type { ConfinementVerdict }                                            from '../../lib/gate-confinement/GateConfinement.ts';
import { fakeAgentAdapter }                                                   from '../../testing/FakeAgentAdapter.ts';
import { FAKE_CONFINER_ARGV, FAKE_MISSING_TOOLS_REASON, fakeGateConfinement } from '../../testing/FakeGateConfinement.ts';
import { createScratchDirectory, removeScratchDirectory }                     from '../../testing/ScratchWorkspace.ts';
import { IntakeSessions }                                                     from './IntakeSessions.ts';
import { PipelineAgentSessions }                                              from './PipelineAgentSessions.ts';
import { NETWORK_DOMAINS_REFUSAL, SessionConfinement }                        from './SessionConfinement.ts';
import {
  NO_TOOLCHAIN,
  type ProfiledRole,
  type SandboxFacts,
  WorkerProfiles
} from './WorkerProfiles.ts';

const WORKTREE = '/example/repository/.forge-worktrees/ticket-007';
const HATCH_DIRECTORY = '/example/repository/.forge-worktrees/hatch/J4';
const HOME_DIRECTORY = '/home/alex-example';
const JOB_FILES_DIRECTORY = '/example/repository/.forge/jobs/J4';

const FACTS: SandboxFacts = {
  dataFolder:                    '/example/repository/.forge',
  monitorFolder:                 '/home/alex-example/.forge-monitor',
  homeDirectory:                 HOME_DIRECTORY,
  worktree:                      WORKTREE,
  commonGitDirectory:            '/example/repository/.git',
  targetBranches:                ['main'],
  otherTicketBranches:           ['ticket-003'],
  otherWorktreeAdminFolders:     ['/example/repository/.git/worktrees/ticket-003'],
  hatchDirectory:                HATCH_DIRECTORY,
  repositoryRoot:                '/example/repository',
  gitHooksDirectory:             '/example/repository/.githooks',
  commitSigning:                 { kind: 'unsigned' },
  credentialPaths:               ['/home/alex-example/.ssh'],
  gpgHomeDirectory:              '/home/alex-example/.gnupg',
  executableSearchPath:          [],
  cacheFolderStyle:              dataFoldersFor('linux', ''),
  sandboxDenyShape:              'path-rules',
  agentConfigurationFolderNames: ['.example-agent'],
  guardCommand:                  ['/example/bin/bun', '/example/tool/agent-progress.ts'],
};

function roleProfileOf(role: ProfiledRole): WorkerProfile {
  return WorkerProfiles.profileOf(role, FACTS, NO_TOOLCHAIN);
}

const PROFILE_OF_ROLE: Readonly<Record<string, WorkerProfile>> = {
  'builder':        roleProfileOf('builder'),
  'reviewer':       roleProfileOf('reviewer'),
  'assistant':      roleProfileOf('assistant'),
  'product-owner':  IntakeSessions.productOwnerProfileOf(roleProfileOf('product-owner')),
  'pipeline-agent': PipelineAgentSessions.pipelineAgentProfileOf(roleProfileOf('assistant'), HATCH_DIRECTORY),
};

const AGENT_FOLDERS = ['/home/alex-example/.example-agent'];

function adapterOf(ownConfinement: 'applies-the-profile' | 'none'): AgentAdapter {
  const adapter = fakeAgentAdapter();
  return { ...adapter, capabilities: { ...adapter.capabilities, ownConfinement }, sessionWritablePathsOf: () => AGENT_FOLDERS };
}

function launchRequestOf(profile: WorkerProfile, jobFilesDirectory = JOB_FILES_DIRECTORY): AgentLaunchRequest {
  return {
    programPath:      '/example/bin/agent',
    sessionId:        'example-session',
    resume:           false,
    workingDirectory: WORKTREE,
    homeDirectory:    HOME_DIRECTORY,
    firstMessage:     'Example first message',
    roleBrief:        'Example role',
    model:            'example-model',
    effort:           'medium',
    environment:      {},
    profile,
    confinement:      'confined',
    jobFilesDirectory,
    reportSchema:     null,
  };
}

describe('the plan of each role\'s profile', () => {
  test.each(Object.entries(PROFILE_OF_ROLE))('%s: its checkout, its roots, its extra folder and the agent\'s folders, its denies, the whole network', (_role, profile) => {
    const plan = SessionConfinement.planOf(launchRequestOf(profile), AGENT_FOLDERS);

    expect(plan).toEqual({
      worktree:            profile.writeRoot ?? WORKTREE,
      writableRoots:       [...profile.writableRoots, profile.extraWritableDirectory, ...AGENT_FOLDERS],
      worktreeAdminFolder: null,
      temporaryDirectory:  null,
      writableCachePaths:  [],
      deniedWritableRoots: profile.deniedWritableRoots,
      deniedReadableRoots: profile.deniedReadableRoots,
      network:             true,
      confinementFilePath: join(JOB_FILES_DIRECTORY, 'session-confinement'),
    });
  });

  test('a session in a project folder of its checkout writes the whole checkout, its write root', () => {
    const profile = { ...roleProfileOf('builder'), writeRoot: '/example/repository/.forge-worktrees/ticket-008' };
    expect(SessionConfinement.planOf(launchRequestOf(profile), []).worktree).toBe('/example/repository/.forge-worktrees/ticket-008');
  });
});

describe('who confines a session', () => {
  const VERDICTS: ConfinementVerdict[] = ['confined', 'unavailable', 'unconfined-by-design'];

  test.each(VERDICTS.map((verdict) => [verdict] as const))(
    'an agent that applies the profile is confined as the port says its workers are, and never refused, the port answering %s',
    (verdict) => {
      const port = fakeGateConfinement(verdict === 'confined' ? 'unavailable' : verdict, verdict);
      const capabilities = { ownConfinement: 'applies-the-profile' } as const;
      expect(SessionConfinement.confinementVerdictOf(capabilities, port)).toBe(verdict);
      expect(SessionConfinement.refusalOf(capabilities, port, { ...roleProfileOf('builder'), shellNetworkDomains: ['registry.example.org'] })).toBeNull();
    },
  );

  test('an agent with no sandbox is confined as the port is available, and an unavailable port still asks for confinement', () => {
    const capabilities = { ownConfinement: 'none' } as const;
    expect(VERDICTS.map((verdict) => SessionConfinement.confinementVerdictOf(capabilities, fakeGateConfinement(verdict, 'confined')))).toEqual([...VERDICTS]);
    expect(VERDICTS.map((verdict) => SessionConfinement.launchConfinementOf(capabilities, fakeGateConfinement(verdict, 'confined'))))
      .toEqual<ConfinementVerdict[]>(['confined', 'confined', 'unconfined-by-design']);
  });

  test('forge\'s confinement refuses a profile with shell or web domains, since it allows the network whole or not at all', () => {
    const capabilities = { ownConfinement: 'none' } as const;
    const port = fakeGateConfinement('confined');
    const builder = roleProfileOf('builder');
    expect(SessionConfinement.refusalOf(capabilities, port, builder)).toBeNull();
    expect(SessionConfinement.refusalOf(capabilities, port, { ...builder, shellNetworkDomains: ['registry.example.org'] })).toBe(NETWORK_DOMAINS_REFUSAL);
    expect(SessionConfinement.refusalOf(capabilities, port, { ...builder, webNetworkDomains: ['docs.example.org'] })).toBe(NETWORK_DOMAINS_REFUSAL);
    expect(SessionConfinement.refusalOf(capabilities, port, PROFILE_OF_ROLE['product-owner'] ?? builder)).toBeNull();
  });
});

describe('the launch of a session', () => {
  test('an agent that applies the profile gets its own plan, and the port wraps nothing', () => {
    const port = fakeGateConfinement('confined');
    const adapter = adapterOf('applies-the-profile');
    const request = launchRequestOf(roleProfileOf('builder'));
    expect(SessionConfinement.sessionLaunchOf(adapter, port, request)).toEqual({ verdict: 'runs', plan: adapter.planOf(request) });
    expect(port.plans).toEqual([]);
  });

  test('an agent with no sandbox runs its argv wrapped by the port, under the plan of its profile', () => {
    const jobFilesDirectory = createScratchDirectory('session-confinement');
    try {
      const port = fakeGateConfinement('confined');
      const adapter = adapterOf('none');
      const request = launchRequestOf(roleProfileOf('builder'), jobFilesDirectory);
      const launch = SessionConfinement.sessionLaunchOf(adapter, port, request);

      expect(launch).toEqual({ verdict: 'runs', plan: { ...adapter.planOf(request), argv: [...FAKE_CONFINER_ARGV, ...adapter.planOf(request).argv] } });
      expect(port.plans).toEqual([SessionConfinement.planOf(request, AGENT_FOLDERS)]);
    } finally {
      removeScratchDirectory(jobFilesDirectory);
    }
  });

  test('an agent with no sandbox is refused where the port is unavailable, and runs unwrapped where it confines nothing by design', () => {
    const adapter = adapterOf('none');
    const request = launchRequestOf(roleProfileOf('builder'));
    expect(SessionConfinement.sessionLaunchOf(adapter, fakeGateConfinement('unavailable'), request)).toEqual({ verdict: 'refused', reason: FAKE_MISSING_TOOLS_REASON });
    const unconfined = { ...request, confinement: 'unconfined-by-design' } as const;
    const windows = fakeGateConfinement('unconfined-by-design');
    expect(SessionConfinement.sessionLaunchOf(adapter, windows, unconfined)).toEqual({ verdict: 'runs', plan: adapter.planOf(unconfined) });
    expect(windows.plans).toEqual([]);
  });
});
