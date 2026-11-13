/**
 * The install as a flow, over the compiler, joiner and signer recorded from a real Mac, one answer set per situation, into a scratch
 * Applications folder. What matters: the bundle is generated whole, built and signed in a staging folder and only then put in place, over
 * an earlier install of Gaia's; a compile or a signing that fails leaves the earlier install as it was; another application of the same name
 * is never touched; and no staging folder is left behind.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
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
import { GAIA_INSTALL_VERSION }                                          from '../../shared/constants/InstallVersion.ts';
import { repositoryRoot }                                                from '../../testing/BoundaryRecordings.ts';
import { runCallShapeOf, type RecordedProcessRun }                       from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                     from '../../testing/ScratchRoot.ts';
import { appInstallMessageOf, createAppInstall, type AppInstallVerdict } from './AppInstall.ts';
import { recordedAppInstallProgramsOf, type AppInstallSituation }        from './testing/RecordedAppInstallPrograms.ts';

const BUNDLE_RESOURCES_FOLDER = join(repositoryRoot(), 'resources', 'app-bundle');
const EXAMPLE_REPOSITORY_PATH = '/Users/example/Development/gaia';
const EXAMPLE_BUN_PROGRAM = '/Users/example/.bun/bin/bun';
const EXAMPLE_GAIA_VERSION = '0.1.0';
const PERMISSION_BITS_MASK = 0o777;
const LAUNCH_SCRIPT_MODE = 0o755;
const READ_ONLY_FOLDER_MODE = 0o555;
const WRITABLE_FOLDER_MODE = 0o755;

const COMPILE_ARM_SHAPE = runCallShapeOf('/usr/bin/clang', ['-arch', 'arm64', '-mmacosx-version-min=12.0', '-Os', '-Wall', '-Werror', '-o', 'launch-arm64', 'launch.c']);
const COMPILE_INTEL_SHAPE = runCallShapeOf('/usr/bin/clang', ['-arch', 'x86_64', '-mmacosx-version-min=12.0', '-Os', '-Wall', '-Werror', '-o', 'launch-x86_64', 'launch.c']);
const JOIN_SHAPE = runCallShapeOf('/usr/bin/lipo', ['-create', '-output', 'Gaia.app/Contents/MacOS/launch', 'launch-arm64', 'launch-x86_64']);
const SIGN_SHAPE = runCallShapeOf('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', 'Gaia.app']);

let applicationsFolder = '';
let appBundlePath = '';

beforeEach(() => {
  applicationsFolder = join(createScratchDirectory('app-install-home'), 'Applications');
  appBundlePath      = join(applicationsFolder, 'Gaia.app');
});

afterEach(() => {
  removeScratchPath(join(applicationsFolder, '..'));
});

interface InstallRun {
  readonly verdict:    AppInstallVerdict;
  readonly processRun: RecordedProcessRun;
}

async function installIn(situation: AppInstallSituation, bundleResourcesFolder: string = BUNDLE_RESOURCES_FOLDER): Promise<InstallRun> {
  const processRun = recordedAppInstallProgramsOf(situation);
  const verdict = await createAppInstall({
    applicationsFolder,
    bundleResourcesFolder,
    repositoryPath: EXAMPLE_REPOSITORY_PATH,
    bunProgram:     EXAMPLE_BUN_PROGRAM,
    gaiaVersion:    EXAMPLE_GAIA_VERSION,
    processRun,
  }).install();
  return { verdict, processRun };
}

function bundleFile(...pathInBundle: readonly string[]): string {
  return join(appBundlePath, 'Contents', ...pathInBundle);
}

/** An earlier install as Gaia's, or another application's, with a file of its own that a replacement would remove. */
function placeEarlierBundle(infoPlist: string): void {
  mkdirSync(join(appBundlePath, 'Contents'), { recursive: true });
  writeFileSync(bundleFile('Info.plist'), infoPlist);
  writeFileSync(bundleFile('earlier-file'), 'the earlier bundle');
}

const EARLIER_GAIA_PLIST = '<plist><dict><key>GaiaInstallVersion</key>\n<integer>0</integer></dict></plist>\n';
const OTHER_APPLICATION_PLIST = '<plist><dict><key>CFBundleName</key><string>Gaia</string></dict></plist>\n';

function stagingFolderRemains(): boolean {
  return existsSync(join(applicationsFolder, '.Gaia.app.installing'));
}

describe('an install where the programs answer', () => {
  test('makes the Applications folder, builds and signs in staging, and places the generated bundle', async () => {
    const { verdict, processRun } = await installIn('installs');
    expect(verdict).toEqual({ verdict: 'installed', appBundlePath, replacedAnEarlierInstall: false });
    expect(processRun.callShapesAnswered()).toEqual([COMPILE_ARM_SHAPE, COMPILE_INTEL_SHAPE, JOIN_SHAPE, SIGN_SHAPE]);
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'readable', installVersion: GAIA_INSTALL_VERSION });
    expect(readFileSync(bundleFile('MacOS', 'launch.sh'), 'utf8')).toContain(`REPOSITORY_PATH='${EXAMPLE_REPOSITORY_PATH}'`);
    expect(statSync(bundleFile('MacOS', 'launch.sh')).mode & PERMISSION_BITS_MASK).toBe(LAUNCH_SCRIPT_MODE);
    expect(readFileSync(bundleFile('Resources', 'Gaia.icns'))).toEqual(readFileSync(join(BUNDLE_RESOURCES_FOLDER, 'Gaia.icns')));
    expect(stagingFolderRemains()).toBe(false);
  });

  test('replaces an earlier install of Gaia\'s whole', async () => {
    placeEarlierBundle(EARLIER_GAIA_PLIST);
    expect((await installIn('installs')).verdict).toEqual({ verdict: 'installed', appBundlePath, replacedAnEarlierInstall: true });
    expect(existsSync(bundleFile('earlier-file'))).toBe(false);
    expect(await new AppBundleInfoFile(appBundlePath).read()).toEqual({ verdict: 'readable', installVersion: GAIA_INSTALL_VERSION });
    expect(stagingFolderRemains()).toBe(false);
  });
});

describe('an install that fails', () => {
  test('when the compiler refuses keeps the earlier install, signs nothing and says what the compiler said', async () => {
    placeEarlierBundle(EARLIER_GAIA_PLIST);
    const { verdict, processRun } = await installIn('compiler-refuses');
    expect(verdict).toMatchObject({ verdict: 'unrepaired', failure: 'compile-failed', appBundlePath });
    expect(verdict.verdict === 'unrepaired' ? verdict.detail : '').toStartWith('/usr/bin/clang exited 1: launch.c:1:25: error:');
    expect(processRun.callShapesAnswered()).toEqual([COMPILE_ARM_SHAPE]);
    expect(readFileSync(bundleFile('earlier-file'), 'utf8')).toBe('the earlier bundle');
    expect(stagingFolderRemains()).toBe(false);
  });

  test('when the signer refuses keeps the earlier install and places nothing', async () => {
    placeEarlierBundle(EARLIER_GAIA_PLIST);
    const { verdict, processRun } = await installIn('signer-refuses');
    expect(verdict).toEqual({
      verdict: 'unrepaired',
      failure: 'signing-failed',
      appBundlePath,
      detail:  '/usr/bin/codesign exited 1: Gaia.app: replacing existing signature\nGaia.app: Permission denied',
    });
    expect(processRun.callShapesAnswered()).toEqual([COMPILE_ARM_SHAPE, COMPILE_INTEL_SHAPE, JOIN_SHAPE, SIGN_SHAPE]);
    expect(readFileSync(bundleFile('earlier-file'), 'utf8')).toBe('the earlier bundle');
    expect(stagingFolderRemains()).toBe(false);
  });

  test('when the earlier install cannot be moved aside keeps it in place and leaves no staging folder', async () => {
    placeEarlierBundle(EARLIER_GAIA_PLIST);
    // A folder that cannot be written cannot move into another folder: the system refuses the move with EACCES.
    chmodSync(appBundlePath, READ_ONLY_FOLDER_MODE);
    try {
      const { verdict, processRun } = await installIn('installs');
      expect(verdict).toEqual({
        verdict: 'unrepaired', failure: 'bundle-not-placed', appBundlePath, detail: 'EACCES'
      });
      expect(processRun.callShapesAnswered()).toEqual([COMPILE_ARM_SHAPE, COMPILE_INTEL_SHAPE, JOIN_SHAPE, SIGN_SHAPE]);
    } finally {
      chmodSync(appBundlePath, WRITABLE_FOLDER_MODE);
    }
    expect(readFileSync(bundleFile('earlier-file'), 'utf8')).toBe('the earlier bundle');
    expect(stagingFolderRemains()).toBe(false);
  });

  test('when its templates cannot be read runs nothing and writes nothing', async () => {
    const { verdict, processRun } = await installIn('installs', join(applicationsFolder, '..', 'no-resources'));
    expect(verdict).toEqual({
      verdict: 'unrepaired', failure: 'templates-unreadable', appBundlePath, detail: 'ENOENT'
    });
    expect(processRun.callShapesAnswered()).toEqual([]);
    expect(existsSync(applicationsFolder)).toBe(false);
  });
});

describe('an install beside another application of the same name', () => {
  test('is refused, runs nothing and leaves that application as it is', async () => {
    placeEarlierBundle(OTHER_APPLICATION_PLIST);
    const { verdict, processRun } = await installIn('installs');
    expect(verdict).toEqual({ verdict: 'refused', refusal: 'another-application-in-place', appBundlePath });
    expect(processRun.callShapesAnswered()).toEqual([]);
    expect(readFileSync(bundleFile('Info.plist'), 'utf8')).toBe(OTHER_APPLICATION_PLIST);
    expect(readFileSync(bundleFile('earlier-file'), 'utf8')).toBe('the earlier bundle');
  });

  test('says that Gaia leaves it in place', () => {
    expect(appInstallMessageOf({ verdict: 'refused', refusal: 'another-application-in-place', appBundlePath: '/Users/example/Applications/Gaia.app' }))
      .toBe('Another application is installed at /Users/example/Applications/Gaia.app. Gaia leaves it in place and installs nothing.');
  });
});
