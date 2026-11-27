/**
 * The real-system spec of the install, run only by `bun run record app-install-programs` on a Mac with the developer tools: it installs Gaia.app
 * for real into a scratch Applications folder and records what the compiler, joiner and signer answer, a rejected launcher source and an unwritable
 * signature included. The Darwin release stamps the recording.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { AppBundleInfoFile }                                             from '../../adapters/app-bundle/AppBundleInfoFile.ts';
import { realProcessRun, type ProcessRun }                               from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                                               from '../../services/Environment.ts';
import { GAIA_INSTALL_VERSION }                                          from '../../shared/constants/InstallVersion.ts';
import { recordAnswer, repositoryRoot }                                  from '../../testing/BoundaryRecordings.ts';
import { runCallShapeOf, situationCallShapeOf }                          from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                     from '../../testing/ScratchRoot.ts';
import { createAppInstall, type AppInstallVerdict }                      from './AppInstall.ts';
import { APP_INSTALL_PROGRAMS_RECORDING_NAME, type AppInstallSituation } from './testing/RecordedAppInstallPrograms.ts';

const BUNDLE_RESOURCES_FOLDER = join(repositoryRoot(), 'resources', 'app-bundle');
const CHECK_TIMEOUT_MILLISECONDS = 30_000;
const READ_ONLY_FOLDER_MODE = 0o555;
const WRITABLE_FOLDER_MODE = 0o755;
const SIGNING_PROGRAM = '/usr/bin/codesign';
const STAGED_CONTENTS_FOLDER = join('Gaia.app', 'Contents');

let applicationsFolder = '';
let resourcesCopy = '';

beforeEach(() => {
  applicationsFolder = createScratchDirectory('applications');
  resourcesCopy      = createScratchDirectory('app-bundle-resources');
});

afterEach(() => {
  removeScratchPath(applicationsFolder);
  removeScratchPath(resourcesCopy);
});

/**
 * The real process-run, recording each run under its situation. When the signer is to refuse, the staged bundle's folder is read-only while
 * it signs, and writable again after, so the install still clears its staging folder.
 */
function recordingProcessRun(situation: AppInstallSituation): ProcessRun {
  const processRun = realProcessRun(environmentCopy);
  return {
    run: async (request) => {
      const lockedFolder = situation === 'signer-refuses' && request.program === SIGNING_PROGRAM ? join(request.workingDirectory, STAGED_CONTENTS_FOLDER) : null;
      if (lockedFolder !== null) chmodSync(lockedFolder, READ_ONLY_FOLDER_MODE);
      const answer = await processRun.run(request);
      if (lockedFolder !== null) chmodSync(lockedFolder, WRITABLE_FOLDER_MODE);
      recordAnswer(APP_INSTALL_PROGRAMS_RECORDING_NAME, situationCallShapeOf(situation, runCallShapeOf(request.program, request.programArguments)), answer);
      return answer;
    },
    startOwned: (request) => {
      throw new Error(`An install starts no program it owns, and was asked to start ${request.program}.`);
    },
    startDetached: (request) => {
      throw new Error(`An install starts no detached program, and was asked to start ${request.program}.`);
    },
  };
}

function installIn(situation: AppInstallSituation, bundleResourcesFolder: string): Promise<AppInstallVerdict> {
  return createAppInstall({
    applicationsFolder,
    bundleResourcesFolder,
    repositoryPath: repositoryRoot(),
    bunProgram:     process.execPath,
    gaiaVersion:    '0.0.0-example',
    processRun:     recordingProcessRun(situation),
  }).install();
}

async function finishedOutputOf(program: string, programArguments: readonly string[]): Promise<string> {
  const answer = await realProcessRun(environmentCopy).run({
    program, programArguments, workingDirectory: applicationsFolder, timeoutMilliseconds: CHECK_TIMEOUT_MILLISECONDS
  });
  if (answer.verdict !== 'finished' || answer.exitCode !== 0) throw new Error(`${program} ${programArguments.join(' ')} answered ${JSON.stringify(answer)}`);
  return `${answer.standardOutput}${answer.standardError}`;
}

function resourcesWithLauncherSource(launcherSource: string): string {
  for (const fileName of ['Info.plist.template', 'launch.sh.template', 'Gaia.icns']) copyFileSync(join(BUNDLE_RESOURCES_FOLDER, fileName), join(resourcesCopy, fileName));
  writeFileSync(join(resourcesCopy, 'launch.m'), launcherSource);
  return resourcesCopy;
}

describe('an install on a real Mac', () => {
  test('compiles a universal launcher, signs the bundle and places it, and installs again over its earlier install', async () => {
    const appBundlePath = join(applicationsFolder, 'Gaia.app');
    expect(await installIn('installs', BUNDLE_RESOURCES_FOLDER)).toEqual({ verdict: 'installed', appBundlePath, replacedAnEarlierInstall: false });
    expect(await installIn('installs', BUNDLE_RESOURCES_FOLDER)).toEqual({ verdict: 'installed', appBundlePath, replacedAnEarlierInstall: true });

    const launcherPath = join(appBundlePath, 'Contents', 'MacOS', 'launch');
    expect((await finishedOutputOf('/usr/bin/lipo', ['-archs', launcherPath])).trim().split(' ').sort()).toEqual(['arm64', 'x86_64']);
    await finishedOutputOf(SIGNING_PROGRAM, ['--verify', '--deep', '--strict', appBundlePath]);
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'readable', installVersion: GAIA_INSTALL_VERSION });
    expect(existsSync(join(applicationsFolder, '.Gaia.app.installing'))).toBe(false);

    // The stub runs the script beside it and ends with it: a script that names itself proves it, without opening Gaia's window.
    writeFileSync(join(appBundlePath, 'Contents', 'MacOS', 'launch.sh'), '#!/bin/sh\necho "launched $(basename "$0")"\n');
    expect(await finishedOutputOf(launcherPath, [])).toBe('launched launch.sh\n');
  });

  test('installs nothing when the compiler rejects the launcher source', async () => {
    const verdict = await installIn('compiler-refuses', resourcesWithLauncherSource('int main(void) { return undeclaredExample; }\n'));
    expect(verdict).toMatchObject({ verdict: 'unrepaired', failure: 'compile-failed' });
    expect(existsSync(join(applicationsFolder, 'Gaia.app'))).toBe(false);
    expect(existsSync(join(applicationsFolder, '.Gaia.app.installing'))).toBe(false);
  });

  test('installs nothing when the signer cannot write its signature', async () => {
    const verdict = await installIn('signer-refuses', BUNDLE_RESOURCES_FOLDER);
    expect(verdict).toMatchObject({ verdict: 'unrepaired', failure: 'signing-failed' });
    expect(existsSync(join(applicationsFolder, 'Gaia.app'))).toBe(false);
    expect(existsSync(join(applicationsFolder, '.Gaia.app.installing'))).toBe(false);
  });
});
