/**
 * The extraction changed no byte on macOS: the Seatbelt profile, the gate argv with and without confinement and the written settings file
 * equal `cli/FrozenPlatformPorts.json`, whose `retake` key says how it was taken.
 */
import { dirname }      from 'node:path';
import { expect, test } from 'bun:test';

import type { AgentLaunchRequest }                     from '../src/lib/agent-launch/AgentLaunchRequest.ts';
import { createPosixLaunchEnvironment }                from '../src/lib/agent-launch/PosixLaunchEnvironment.ts';
import { createDarwinSeatbelt, seatbeltProfileTextOf } from '../src/lib/gate-confinement/DarwinSeatbelt.ts';
import type { ConfinementPlan }                        from '../src/lib/gate-confinement/GateConfinement.ts';
import { platformPortsFor }                            from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { createPosixShellLine }                        from '../src/lib/shell-line/PosixShellLine.ts';
import { LineSandbox, type ProcessSandboxRequest }     from '../src/services/hephaestus/LineSandbox.ts';
import { settingsTextBeforePowerShell }                from '../src/testing/SettingsBeforePowerShell.ts';
import { agentAdapterOfThisProcess }                   from './CommandContext.ts';
import frozenTable                                     from './FrozenPlatformPorts.json';

const ports = platformPortsFor('darwin', {
  userShell:                    () => undefined,
  commandInterpreter:           () => undefined,
  systemRoot:                   () => undefined,
  localApplicationDataFolder:   () => undefined,
  roamingApplicationDataFolder: () => undefined,
  programFilesFolder:           () => undefined,
  programExtensions:            () => undefined,
  monitorFolderName:            '.example-monitor',
  pipeNamePrefix:               'example-product'
});
const claudeCodeAdapter = agentAdapterOfThisProcess();
const { launchFiles } = frozenTable;

/** The table predates the request's cache folder style; the Seatbelt is macOS's, so its style is too. */
function darwinRequestOf(frozenRequest: (typeof frozenTable.seatbeltProfiles)[number]['request'] | undefined): ProcessSandboxRequest {
  return { ...frozenRequest, cacheFolderStyle: ports.dataFolders } as ProcessSandboxRequest;
}

test('the Seatbelt profile of every fixed request equals the frozen text', () => {
  for (const { request, text } of frozenTable.seatbeltProfiles) {
    expect(seatbeltProfileTextOf(LineSandbox.planOf(darwinRequestOf(request), ''))).toBe(text);
  }
});

test('the gate argv of every fixed line and shell equals the frozen one', () => {
  for (const { line, userShell, argv } of frozenTable.shellLines) {
    expect(createPosixShellLine({ userShell: () => userShell ?? undefined }).spawnRequestOf(line, '/example/line-status').argv).toEqual(argv);
  }
});

test('the confined gate argv equals the frozen one', () => {
  const seatbelt = createDarwinSeatbelt({ fileExists: () => true, programSucceeds: () => true, writeFile: () => undefined });
  for (const { profilePath, argv, confinedArgv } of frozenTable.confinedArgv) {
    const plan = LineSandbox.planOf(darwinRequestOf(frozenTable.seatbeltProfiles[0]?.request), profilePath);
    expect(seatbelt.confinedArgvOf(plan satisfies ConfinementPlan, argv)).toEqual(confinedArgv);
  }
});

/** The table predates the request's home; with no `HOME` the home sits above the repository, whose exclusion the list holds, so the bytes stand. */
/** The frozen guard is one shell-form `commandArgv`; it is given to the adapter as the program and arguments the exec form runs. */
function requestOfFrozen(frozenRequest: (typeof frozenTable.settingsFiles)[number]['request']): AgentLaunchRequest {
  const homeDirectory = 'HOME' in frozenRequest.environment ? frozenRequest.environment.HOME : dirname(frozenRequest.profile.instructionsRoot);
  const frozenGuard = frozenRequest.profile.networkDomainGuard as { allowedDomains: string[]; commandArgv: string[] } | null;
  const networkDomainGuard = frozenGuard === null
    ? null
    : { allowedDomains: frozenGuard.allowedDomains, programPath: frozenGuard.commandArgv[0] ?? '', arguments: frozenGuard.commandArgv.slice(1) };
  return {
    ...frozenRequest, homeDirectory, programPath: 'claude', profile: { ...frozenRequest.profile, networkDomainGuard }
  } as unknown as AgentLaunchRequest;
}

test('the written settings file of every fixed request equals the frozen bytes, but for the PowerShell rules and the exec-form hook', () => {
  for (const { request, text } of frozenTable.settingsFiles) {
    const settings = claudeCodeAdapter.planOf(requestOfFrozen(request)).files.find(({ path }) => path.endsWith('settings.json'));
    expect(settingsTextBeforePowerShell(settings?.text ?? '{}')).toBe(text);
  }
});

test('the launch environment of the fixed job equals the one the agent launch file was taken with', () => {
  const [settingsEntry] = frozenTable.settingsFiles;
  expect(createPosixLaunchEnvironment(() => []).launchEnvironmentOf(launchFiles.inherited, launchFiles.jobVariables)).toEqual(settingsEntry?.request.environment ?? {});
});
