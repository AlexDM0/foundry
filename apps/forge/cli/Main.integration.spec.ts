/**
 * The install version check of `cli/Main.spec.ts`, for the routes that differ only in the built binary under a job's environment: a
 * mutating verb relays before the check, and the two hooks that skip it. Each case starts the binary, so it sits here.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
}                                                         from 'bun:test';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE, HATCH_REPLY_INTERVAL_VARIABLE } from '../src/shared/Environment.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                  from '../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDirectory, removeScratchDirectory }                           from '../src/testing/ScratchWorkspace.ts';
import { installedFilePathsIn }                                                     from './InstalledFiles.ts';
import { runCommandLine }                                                           from './Main.ts';
import { createCapturedCommandContext }                                             from './testing/CapturedCommandContext.ts';
import { runAgentProgress }                                                         from './testing/CliProcess.ts';

/** Nothing answers the Hatch here, so the relayed verb waits out every look for its reply; short looks keep that wait brief. */
const SHORT_HATCH_REPLY_INTERVAL_MILLISECONDS = '1';

describe('a tracker whose installed files are of another install version, under the binary', () => {
  /** A tracker made by `init` and then stripped of its manifest is exactly a tracker installed by an agent-progress from before versioning. */
  let trackedDirectory = '';

  beforeEach(async () => {
    trackedDirectory = realpathSync(createScratchDirectory('main-install-version'));
    const initialisingContext = createCapturedCommandContext({ currentDirectory: trackedDirectory });
    expect(await runCommandLine(['init', '--project', 'Example Agency', '--no-hooks'], initialisingContext)).toBe(0);
    rmSync(installedFilePathsIn(trackedDirectory).installManifest);
  });

  afterEach(() => {
    removeScratchDirectory(trackedDirectory);
  });

  test('under a job a mutating verb relays before the install check, writing a versioned request, and prints queued at exit 0', async () => {
    const hatchFolder = createScratchDirectory('main-hatch');
    try {
      const result = await runAgentProgress(['ticket', 'add', 'Found beside the work', '--type', 'bug', '--priority', 'low'], {
        currentDirectory: trackedDirectory,
        environment:      { [JOB_ID_VARIABLE]: 'J7', [HATCH_DIRECTORY_VARIABLE]: hatchFolder, [HATCH_REPLY_INTERVAL_VARIABLE]: SHORT_HATCH_REPLY_INTERVAL_MILLISECONDS },
      });
      const [requestFileName, ...otherFileNames] = readdirSync(join(hatchFolder, 'requests'));
      const request = JSON.parse(readFileSync(join(hatchFolder, 'requests', requestFileName ?? ''), 'utf8')) as { hatchFormatVersion: number; requestId: string };

      expect(result.exitCode, result.standardError).toBe(0);
      expect(otherFileNames).toEqual([]);
      expect(request.hatchFormatVersion).toBe(1);
      expect(result.standardOutput.trim()).toBe(`queued ${request.requestId}`);
      expect(existsSync(installedFilePathsIn(trackedDirectory).installManifest)).toBe(false);
    } finally {
      removeScratchDirectory(hatchFolder);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('hook bash-domains skips the install check: under a job it still answers deny through its JSON at exit 0', async () => {
    const hatchFolder = createScratchDirectory('main-bash-domains');
    try {
      const webFetch = { hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://example.net/' } };
      const result = await runAgentProgress(['hook', 'bash-domains', '--allow', 'registry.example.com'], {
        currentDirectory: trackedDirectory,
        environment:      { [JOB_ID_VARIABLE]: 'J7', [HATCH_DIRECTORY_VARIABLE]: hatchFolder },
        standardInput:    JSON.stringify(webFetch),
      });
      expect(result.exitCode, result.standardError).toBe(0);
      expect(result.standardError).toBe('');
      expect(JSON.parse(result.standardOutput)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
      expect(existsSync(installedFilePathsIn(trackedDirectory).installManifest)).toBe(false);
    } finally {
      removeScratchDirectory(hatchFolder);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('hook session-start skips the install check: it prints the session instructions at exit 0, and nothing under a job', async () => {
    const hatchFolder = createScratchDirectory('main-session-start');
    try {
      const instructions = readFileSync(installedFilePathsIn(trackedDirectory).sessionInstructions, 'utf8');
      const session = await runAgentProgress(['hook', 'session-start'], { currentDirectory: trackedDirectory, standardInput: '{}' });
      expect(session.exitCode, session.standardError).toBe(0);
      expect(session.standardOutput).toBe(instructions);
      expect(session.standardError).toBe('');

      const underAJob = await runAgentProgress(['hook', 'session-start'], {
        currentDirectory: trackedDirectory,
        environment:      { [JOB_ID_VARIABLE]: 'J7', [HATCH_DIRECTORY_VARIABLE]: hatchFolder },
        standardInput:    '{}',
      });
      expect(underAJob.exitCode, underAJob.standardError).toBe(0);
      expect(underAJob.standardOutput).toBe('');

      rmSync(installedFilePathsIn(trackedDirectory).sessionInstructions);
      const unreadable = await runAgentProgress(['hook', 'session-start', '--unknown'], { currentDirectory: trackedDirectory, standardInput: '' });
      expect(unreadable.exitCode, 'whatever goes wrong, the hook exits 0 and prints nothing').toBe(0);
      expect(unreadable.standardOutput).toBe('');
      expect(unreadable.standardError).toBe('');
      expect(existsSync(installedFilePathsIn(trackedDirectory).installManifest)).toBe(false);
    } finally {
      removeScratchDirectory(hatchFolder);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
