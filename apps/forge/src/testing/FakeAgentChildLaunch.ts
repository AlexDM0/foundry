/**
 * An agent's launch to Talos as the fake agent's adapter plans it: its argv, standing replies, closing line, ending patterns and quit act,
 * with the scenario file the plan names written, so a Talos spec drives a session through the port and names nothing of the vendor.
 * Test-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import type { ChildLaunch }                     from '../domain/talos/ChildLaunch.ts';
import type { AgentLaunchPlan }                 from '../lib/agent-launch/AgentLaunchPlan.ts';
import { type FakeAgentStep, fakeAgentAdapter } from './FakeAgentAdapter.ts';
import { inheritedEnvironment }                 from './InheritedEnvironment.ts';

const FAKE_SESSION_FILES_FOLDER_NAME = 'fake-session-files';

function planOf(boardFolder: string, childFolder: string, instance: number, steps: readonly FakeAgentStep[]): AgentLaunchPlan {
  const sessionFolder = join(boardFolder, childFolder);
  return fakeAgentAdapter(steps).planOf({
    programPath:       process.execPath,
    sessionId:         `fake-session-${instance}`,
    resume:            false,
    workingDirectory:  boardFolder,
    homeDirectory:     boardFolder,
    firstMessage:      'Start.',
    roleBrief:         '',
    model:             'fake-model',
    effort:            'low',
    environment:       inheritedEnvironment(),
    jobFilesDirectory: join(sessionFolder, `${FAKE_SESSION_FILES_FOLDER_NAME}-${instance}`),
    reportSchema:      null,
    confinement:       'confined',
    profile:           {
      writableRoots:          [],
      deniedWritableRoots:    [],
      deniedReadableRoots:    [],
      shellNetworkDomains:    [],
      webNetworkDomains:      'none',
      extraWritableDirectory: boardFolder,
      allowedCommandPrefixes: [],
      deniedCommandPrefixes:  [],
      askUser:                true,
      skills:                 false,
      subagents:              [],
      attribution:            'none',
      instructionsRoot:       boardFolder,
      gitHooksDirectory:      boardFolder,
      commitSigning:          { kind: 'unsigned' },
      networkDomainGuard:     null,
    },
  });
}

/** The launch of a fake session playing `steps`; `changes` replaces fields of the planned launch, such as its argv. */
export function fakeAgentChildLaunch(
  boardFolder: string,
  childFolder: string,
  instance: number,
  steps: readonly FakeAgentStep[],
  changes: Partial<ChildLaunch> = {},
): ChildLaunch {
  const plan = planOf(boardFolder, childFolder, instance, steps);
  for (const file of plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.text);
  }
  return {
    childFolder,
    instance,
    kind:                           'agent',
    label:                          `example agent ${childFolder}`,
    argv:                           plan.argv,
    environment:                    plan.environment,
    environmentFromTalos:           plan.environmentFromTalos ?? {},
    workingDirectory:               boardFolder,
    verbatimArguments:              false,
    standingReplies:                plan.standingReplies,
    closingLine:                    plan.closingLine,
    endingPatterns:                 plan.endingPatterns,
    quitAtTurnEnd:                  plan.quitAtTurnEnd,
    treeStopAtEndGraceMilliseconds: null,
    timeBoundMilliseconds:          null,
    ...changes,
  };
}
