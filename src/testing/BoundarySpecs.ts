/**
 * The real-system specs of each boundary. `bun run record <boundary>` runs them while somebody builds or changes that boundary;
 * `bun run verify` runs none of them. A `boundary` ending in `/` is a folder.
 */
export interface BoundarySpecs {
  readonly boundary: string;
  readonly specs:    readonly string[];
}

export const INTEGRATION_SPEC_SUFFIX = '.integration.spec.ts';

const AIRLOCKS_SPEC = 'src/services/overseer/Airlocks.integration.spec.ts';
const BATON_PASS_SPEC = 'src/services/overseer/BatonPass.integration.spec.ts';
const BUILD_JOB_SPEC = 'cli/overseer/OverseerBuildJob.integration.spec.ts';
const CUSTOMS_SPEC = 'src/services/lifecycle/Customs.integration.spec.ts';
const OVERSEER_API_SPEC = 'cli/overseer/OverseerApi.integration.spec.ts';
const OVERSEER_COMMAND_SPEC = 'cli/overseer/OverseerCommand.integration.spec.ts';
const WATCHER_FLEET_SPEC = 'src/services/overseer/WatcherFleet.integration.spec.ts';
const CHILD_SPAWN_OPTIONS_SPEC = 'cli/overseer/ChildSpawnOptions.integration.spec.ts';
const CRASH_MATRIX_SPEC = 'src/services/overseer/CrashMatrix.integration.spec.ts';
const DRIVE_PASS_SPEC = 'cli/overseer/OverseerDrivePass.integration.spec.ts';
const FAKE_GIT_SPEC = 'src/testing/FakeGit.integration.spec.ts';
const GUARD_EMPTY_SEARCH_PATH_SPEC = 'cli/hooks/BashDomainsHook.emptySearchPath.integration.spec.ts';
const FAKE_WATCHER_WORLD_SPEC = 'src/testing/FakeWatcherWorld.integration.spec.ts';
const HEADLESS_BRIDGE_SPEC = 'bridge/HeadlessBridge.integration.spec.ts';
const SUITE_SPLIT_SPEC = 'src/testing/CheckRecordingStamps.integration.spec.ts';
const SHARED_CASE_DEADLINE_SPEC = 'src/testing/SharedCaseDeadlinePreload.integration.spec.ts';
const TEST_RUN_LEAK_CHECK_SPEC = 'src/testing/TestRunLeakCheck.integration.spec.ts';
const WATCHER_BUNDLE_SPEC = 'src/services/overseer/WatcherBundle.integration.spec.ts';
const LOCAL_ENDPOINT_SPECS = [
  'src/lib/watcher/LocalEndpoint.contract.integration.spec.ts',
  'src/lib/watcher/Watcher.protocol.integration.spec.ts',
  'src/services/overseer/JobControlDelivery.integration.spec.ts',
  'src/services/overseer/WatcherFleet.olderRecord.integration.spec.ts',
];

export const BOUNDARY_SPECS: readonly BoundarySpecs[] = [
  {
    boundary: 'src/lib/git/GitProcess.ts',
    specs:    [
      AIRLOCKS_SPEC,
      BUILD_JOB_SPEC,
      CRASH_MATRIX_SPEC,
      CUSTOMS_SPEC,
      DRIVE_PASS_SPEC,
      FAKE_GIT_SPEC,
      'cli/adoption/init/InitCommand.integration.spec.ts',
      'cli/adoption/update/UpdateCommand.integration.spec.ts',
      'cli/overseer/OverseerWording.instructions.integration.spec.ts',
      'cli/overseer/routes/BoardStateReader.integration.spec.ts',
      'src/ComponentNames.integration.spec.ts',
      'src/LineEndingPolicy.integration.spec.ts',
      'src/lib/git/BranchDiffs.integration.spec.ts',
      'src/lib/git/BranchIntegration.integration.spec.ts',
      'src/lib/git/BranchMerge.integration.spec.ts',
      'src/lib/git/GitIgnore.integration.spec.ts',
      'src/lib/git/GitProcess.integration.spec.ts',
      'src/lib/git/GitWorktrees.integration.spec.ts',
      'src/lib/git/MergeTree.integration.spec.ts',
      'src/lib/git/RecordedGitAnswers.integration.spec.ts',
      'src/lib/git/RefSnapshot.integration.spec.ts',
      'src/lib/git/RepositoryRoot.integration.spec.ts',
      'src/lib/git/Worktrees.integration.spec.ts',
      'src/services/control/WorktreeRepair.integration.spec.ts',
      'src/services/lifecycle/Customs.mergeCheck.integration.spec.ts',
      'src/services/lifecycle/Customs.onboarder.integration.spec.ts',
      'src/services/lifecycle/Customs.provenance.integration.spec.ts',
      'src/services/lifecycle/Landing.integration.spec.ts',
      'src/services/lifecycle/ReviewOutcome.integration.spec.ts',
      'src/services/overseer/Airlocks.airlockAgents.integration.spec.ts',
      'src/services/overseer/GroupWorktrees.integration.spec.ts',
      'src/services/overseer/JobLaunch.gating.integration.spec.ts',
      'src/services/overseer/JobLaunch.retry.integration.spec.ts',
      'src/services/overseer/JobLaunch.targetCatchUp.integration.spec.ts',
      'src/services/overseer/Onboarding.leftoverSnapshot.integration.spec.ts',
      'src/services/overseer/WorkerProfiles.resolver.integration.spec.ts',
    ],
  },
  {
    boundary: 'src/lib/process-identity/',
    specs:    [
      BATON_PASS_SPEC,
      CHILD_SPAWN_OPTIONS_SPEC,
      CRASH_MATRIX_SPEC,
      'cli/overseer/WindowsProcessIdentity.watcher.integration.spec.ts',
      'src/lib/process-identity/ProcessIdentity.integration.spec.ts',
      'src/lib/process-identity/ProcessSupervision.contract.integration.spec.ts',
      'src/services/overseer/GateRunSlots.integration.spec.ts',
      'src/services/overseer/JobControlDelivery.integration.spec.ts',
      'src/services/overseer/JobLaunch.integration.spec.ts',
      'src/services/overseer/JobResumption.integration.spec.ts',
      'src/services/overseer/Regrouping.integration.spec.ts',
      'src/services/overseer/WatcherFleet.olderRecord.integration.spec.ts',
      'src/services/tracker/TrackerLock.integration.spec.ts',
    ],
  },
  {
    boundary: 'src/services/lifecycle/GateRun.ts',
    specs:    [
      CHILD_SPAWN_OPTIONS_SPEC,
      BUILD_JOB_SPEC,
      'src/services/lifecycle/GateRun.integration.spec.ts',
      'src/services/lifecycle/ProposalTwiceRun.integration.spec.ts',
      'src/services/overseer/GateRunSlots.integration.spec.ts',
    ],
  },
  {
    boundary: 'src/lib/gate-confinement/',
    specs:    [BUILD_JOB_SPEC, 'src/lib/gate-confinement/GateConfinement.contract.integration.spec.ts', 'src/services/overseer/ProcessWatcherSandbox.integration.spec.ts'],
  },
  {
    boundary: 'src/lib/watcher/Watcher.ts',
    specs:    [
      CHILD_SPAWN_OPTIONS_SPEC,
      CRASH_MATRIX_SPEC,
      FAKE_WATCHER_WORLD_SPEC,
      WATCHER_FLEET_SPEC,
      'src/lib/watcher/Watcher.integration.spec.ts',
      'src/lib/watcher/Watcher.processTree.integration.spec.ts',
      'src/lib/watcher/Watcher.protocol.integration.spec.ts',
      'src/lib/watcher/Watcher.windowsEnd.integration.spec.ts',
    ],
  },
  { boundary: 'src/lib/watcher/LocalEndpointFor.ts', specs: LOCAL_ENDPOINT_SPECS },
  { boundary: 'src/lib/watcher/PosixSocketEndpoint.ts', specs: LOCAL_ENDPOINT_SPECS },
  { boundary: 'src/lib/watcher/UnsupportedLocalEndpoint.ts', specs: LOCAL_ENDPOINT_SPECS },
  { boundary: 'src/lib/watcher/WindowsPipeEndpoint.ts', specs: LOCAL_ENDPOINT_SPECS },
  { boundary: 'src/lib/owner-only-files/', specs: LOCAL_ENDPOINT_SPECS },
  { boundary: 'src/lib/watcher/WatcherSocketServer.ts', specs: ['src/lib/watcher/Watcher.protocol.integration.spec.ts'] },
  {
    boundary: 'src/services/overseer/WatcherFleet.ts',
    specs:    [
      CHILD_SPAWN_OPTIONS_SPEC,
      BUILD_JOB_SPEC,
      CRASH_MATRIX_SPEC,
      DRIVE_PASS_SPEC,
      FAKE_WATCHER_WORLD_SPEC,
      OVERSEER_COMMAND_SPEC,
      WATCHER_BUNDLE_SPEC,
      WATCHER_FLEET_SPEC,
      'src/services/overseer/JobControlDelivery.integration.spec.ts',
      'src/services/overseer/JobLaunch.gating.integration.spec.ts',
      'src/services/overseer/JobLaunch.integration.spec.ts',
      'src/services/overseer/JobLaunch.retry.integration.spec.ts',
      'src/services/overseer/JobResumption.integration.spec.ts',
      'src/services/overseer/WatcherFleet.olderRecord.integration.spec.ts',
    ],
  },
  { boundary: 'src/services/overseer/WatcherBundle.ts', specs: [WATCHER_BUNDLE_SPEC] },
  { boundary: 'src/services/overseer/InstallChangeWatch.ts', specs: [CHILD_SPAWN_OPTIONS_SPEC] },
  { boundary: 'src/services/overseer/GpgDirectories.ts', specs: ['src/services/overseer/GpgDirectories.integration.spec.ts'] },
  { boundary: 'src/services/overseer/OverseerServer.ts', specs: [HEADLESS_BRIDGE_SPEC, OVERSEER_API_SPEC, 'src/services/overseer/OverseerServer.integration.spec.ts'] },
  { boundary: 'cli/overseer/routes/', specs: [OVERSEER_API_SPEC] },
  { boundary: 'src/services/lifecycle/MergeRun.ts', specs: [AIRLOCKS_SPEC] },
  { boundary: '.platform-probes/', specs: ['src/PlatformProbes.integration.spec.ts'] },
  { boundary: 'cli/OpenInTheDefaultBrowser.ts', specs: [CHILD_SPAWN_OPTIONS_SPEC] },
  { boundary: 'cli/OpenTrackerForWriting.ts', specs: ['cli/RegisterWrittenTracker.integration.spec.ts'] },
  { boundary: 'cli/overseer/OverseerForeground.ts', specs: [CHILD_SPAWN_OPTIONS_SPEC, OVERSEER_API_SPEC, OVERSEER_COMMAND_SPEC] },
  { boundary: 'cli/overseer/OverseerRemote.ts', specs: [CHILD_SPAWN_OPTIONS_SPEC, OVERSEER_COMMAND_SPEC] },
  { boundary: 'bridge/api/CommandClient.ts', specs: [HEADLESS_BRIDGE_SPEC] },
  { boundary: 'bridge/api/IdentityClient.ts', specs: [HEADLESS_BRIDGE_SPEC] },
  { boundary: 'bridge/api/SessionCodeExchange.ts', specs: [HEADLESS_BRIDGE_SPEC] },
  { boundary: 'bridge/testing/HeadlessBridgeCheck.ts', specs: [HEADLESS_BRIDGE_SPEC] },
  { boundary: 'agent-progress.ts', specs: ['cli/BinarySmoke.integration.spec.ts'] },
  {
    boundary: 'cli/testing/CliProcess.ts',
    specs:    [
      OVERSEER_API_SPEC,
      OVERSEER_COMMAND_SPEC,
      'cli/BinarySmoke.integration.spec.ts',
      'cli/GitVersionFloor.integration.spec.ts',
      'cli/HoldJournalCrash.integration.spec.ts',
      'cli/InitRootOverride.integration.spec.ts',
      'cli/Main.integration.spec.ts',
      'cli/MonitorRegistryIsolation.integration.spec.ts',
      'cli/ProductNameIsolation.integration.spec.ts',
      'cli/RegisterWrittenTracker.integration.spec.ts',
      'cli/testing/CliProcess.integration.spec.ts',
      GUARD_EMPTY_SEARCH_PATH_SPEC,
    ],
  },
  { boundary: 'src/services/overseer/GuardCommand.ts', specs: [GUARD_EMPTY_SEARCH_PATH_SPEC] },
  { boundary: 'src/lib/claude-code/ClaudeCodeAdapter.ts', specs: [GUARD_EMPTY_SEARCH_PATH_SPEC] },
  { boundary: 'cli/CommandTable.ts', specs: ['cli/Main.integration.spec.ts'] },
  { boundary: 'eslint.config.js', specs: ['src/LintRules.integration.spec.ts'] },
  { boundary: 'setup.sh', specs: ['cli/SetupScript.integration.spec.ts'] },
  { boundary: 'setup.ts', specs: ['cli/SetupScript.integration.spec.ts', 'cli/Launcher.integration.spec.ts'] },
  { boundary: 'cli/setup/', specs: ['cli/SetupScript.integration.spec.ts', 'cli/Launcher.integration.spec.ts'] },
  { boundary: 'launcher.ts', specs: ['cli/Launcher.integration.spec.ts'] },
  { boundary: 'src/shared/ToolRuntimeUtil.ts', specs: ['cli/Launcher.integration.spec.ts', WATCHER_FLEET_SPEC] },
  { boundary: 'src/lib/executable-resolver/', specs: ['src/lib/executable-resolver/ExecutableResolver.planted.integration.spec.ts'] },
  { boundary: 'src/lib/shell-line/', specs: ['src/lib/shell-line/ShellLine.contract.integration.spec.ts'] },
  { boundary: 'src/shared/Environment.ts', specs: ['src/shared/Environment.integration.spec.ts', 'src/services/tracker/Workspace.integration.spec.ts'] },
  { boundary: 'src/testing/FakeAgentAdapter.ts', specs: ['src/testing/FakeAgentAdapter.integration.spec.ts'] },
  { boundary: 'package.json', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'bunfig.toml', specs: [SHARED_CASE_DEADLINE_SPEC, SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/SharedCaseDeadlinePreload.ts', specs: [SHARED_CASE_DEADLINE_SPEC] },
  { boundary: 'src/testing/BoundarySpecs.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/BoundaryRecordings.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/CheckRecordingStamps.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/InstalledSystemVersion.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/RecordBoundary.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/RecordedAnswers.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/RecordingStamps.ts', specs: [SUITE_SPLIT_SPEC] },
  { boundary: 'src/testing/FakeGit.ts', specs: [FAKE_GIT_SPEC] },
  { boundary: 'src/testing/FakeProcessTable.ts', specs: [BATON_PASS_SPEC] },
  { boundary: 'src/testing/FakeWatcherWorld.ts', specs: [FAKE_WATCHER_WORLD_SPEC] },
  { boundary: 'src/testing/ToolGuard.ts', specs: ['src/testing/ToolGuard.integration.spec.ts'] },
  { boundary: 'src/testing/TrackerIsolation.ts', specs: ['src/testing/TrackerIsolation.integration.spec.ts'] },
  { boundary: 'src/testing/TestRunLeakCheck.ts', specs: [TEST_RUN_LEAK_CHECK_SPEC] },
  { boundary: 'src/testing/TestRunReport.ts', specs: [TEST_RUN_LEAK_CHECK_SPEC, 'src/testing/ToolGuard.integration.spec.ts'] },
  { boundary: 'src/testing/ProcessesInFolder.ts', specs: [TEST_RUN_LEAK_CHECK_SPEC] },
];

export function boundaryIsTouched(boundary: string, changedPath: string): boolean {
  return boundary.endsWith('/') ? changedPath.startsWith(boundary) : changedPath === boundary;
}

/** `Module.ts` and any `Module.<aspect>.integration.spec.ts` beside it, so the spec of a module runs with a change to that module. */
function specIsOfChangedModule(integrationSpecPath: string, changedPath: string): boolean {
  if (!changedPath.endsWith('.ts') || changedPath.endsWith('.spec.ts')) return false;
  return integrationSpecPath.startsWith(changedPath.slice(0, -'ts'.length));
}

/** The real-system specs that prove the changed paths, sorted: those their boundaries list, each changed one, and those of each changed module. */
export function integrationSpecsTouchedBy(changedPaths: readonly string[], integrationSpecPaths: readonly string[]): string[] {
  const listed = BOUNDARY_SPECS
    .filter(({ boundary }) => changedPaths.some((changedPath) => boundaryIsTouched(boundary, changedPath)))
    .flatMap(({ specs }) => specs);
  const besideTheChange = integrationSpecPaths
    .filter((specPath) => changedPaths.some((changedPath) => changedPath === specPath || specIsOfChangedModule(specPath, changedPath)));
  const existing = new Set(integrationSpecPaths);
  return [...new Set([...listed, ...besideTheChange])].filter((specPath) => existing.has(specPath)).sort();
}
