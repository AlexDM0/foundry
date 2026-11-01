/**
 * The extraction changed no byte on macOS: the Seatbelt profile, the gate argv with and without confinement, the written settings file and
 * both launch files equal `cli/FrozenPlatformPorts.json`, whose `retake` key says how it was taken.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { AgentLaunchRequest }                           from '../src/lib/agent-launch/AgentLaunchRequest.ts';
import { POSIX_LAUNCH_ENVIRONMENT }                          from '../src/lib/agent-launch/PosixLaunchEnvironment.ts';
import { createDarwinSeatbelt, seatbeltProfileTextOf }       from '../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { ConfinementPlan }                              from '../src/lib/gate-confinement/GateConfinement.ts';
import { platformPortsFor }                                  from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { createPosixShellLine }                              from '../src/lib/shell-line/PosixShellLine.ts';
import { GateRun }                                           from '../src/services/lifecycle/GateRun.ts';
import { ProcessWatcherSandbox, type ProcessSandboxRequest } from '../src/services/overseer/ProcessWatcherSandbox.ts';
import { WatcherFleet }                                      from '../src/services/overseer/WatcherFleet.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../src/testing/ScratchWorkspace.ts';
import { agentAdapterOfThisProcess }                         from './CommandContext.ts';
import frozenTable                                           from './FrozenPlatformPorts.json';

const ports = platformPortsFor('darwin', { userShell: () => undefined, monitorFolderName: '.example-monitor' });
const claudeCodeAdapter = agentAdapterOfThisProcess();
const { launchFiles } = frozenTable;

let scratch = '';

beforeEach(() => {
  scratch = createScratchDirectory('frozen-ports');
});

afterEach(() => {
  removeScratchDirectory(scratch);
});

function maskedSecret(text: string): string {
  return text.replace(/"watcherSecret": "[0-9a-f]+"/, '"watcherSecret": "masked"');
}

test('the Seatbelt profile of every fixed request equals the frozen text', () => {
  for (const { request, text } of frozenTable.seatbeltProfiles) {
    expect(seatbeltProfileTextOf(ProcessWatcherSandbox.planOf(request as ProcessSandboxRequest, ''))).toBe(text);
  }
});

test('the gate argv of every fixed line and shell equals the frozen one', () => {
  for (const { line, userShell, argv } of frozenTable.shellLines) {
    expect(createPosixShellLine({ userShell: () => userShell ?? undefined }).spawnRequestOf(line).argv).toEqual(argv);
  }
});

test('the confined gate argv equals the frozen one', () => {
  const seatbelt = createDarwinSeatbelt({ fileExists: () => true, programSucceeds: () => true, writeFile: () => undefined });
  for (const { profilePath, argv, confinedArgv } of frozenTable.confinedArgv) {
    const plan = ProcessWatcherSandbox.planOf(frozenTable.seatbeltProfiles[0]?.request as ProcessSandboxRequest, profilePath);
    expect(seatbelt.confinedArgvOf(plan satisfies ConfinementPlan, argv)).toEqual(confinedArgv);
  }
});

/** The table predates the request's home; with no `HOME` the home sits above the repository, whose exclusion the list holds, so the bytes stand. */
function requestOfFrozen(frozenRequest: (typeof frozenTable.settingsFiles)[number]['request']): AgentLaunchRequest {
  const homeDirectory = 'HOME' in frozenRequest.environment ? frozenRequest.environment.HOME : dirname(frozenRequest.profile.instructionsRoot);
  return { ...frozenRequest, homeDirectory, programPath: 'claude' } as unknown as AgentLaunchRequest;
}

test('the written settings file of every fixed request equals the frozen bytes', () => {
  for (const { request, text } of frozenTable.settingsFiles) {
    const settings = claudeCodeAdapter.planOf(requestOfFrozen(request)).files.find(({ path }) => path.endsWith('settings.json'));
    expect(settings?.text).toBe(text);
  }
});

test('the launch environment of the fixed job equals the one the agent launch file was taken with', () => {
  const [settingsEntry] = frozenTable.settingsFiles;
  expect(POSIX_LAUNCH_ENVIRONMENT.launchEnvironmentOf(launchFiles.inherited, launchFiles.jobVariables)).toEqual(settingsEntry?.request.environment ?? {});
});

test('a process launch file equals the frozen bytes', () => {
  WatcherFleet.writeProcessLaunchFile(ports, {
    ...launchFiles.processRequest,
    watcherFolder: scratch,
    environment:   GateRun.gateEnvironmentOf(POSIX_LAUNCH_ENVIRONMENT.launchEnvironmentOf(launchFiles.inherited, {})),
  });
  expect(maskedSecret(readFileSync(join(scratch, 'launch-1.json'), 'utf8'))).toBe(launchFiles.processText);
});

test('an agent launch file equals the frozen bytes', () => {
  const request = frozenTable.settingsFiles[launchFiles.agentRequestIndex]?.request;
  if (request === undefined) throw new Error('the frozen table names no agent request');
  WatcherFleet.writeLaunchFiles(ports, { ...launchFiles.launchBase, jobFolder: scratch, plan: { ...claudeCodeAdapter.planOf(requestOfFrozen(request)), files: [] } });
  expect(maskedSecret(readFileSync(join(scratch, 'launch-1.json'), 'utf8'))).toBe(launchFiles.agentText);
});
