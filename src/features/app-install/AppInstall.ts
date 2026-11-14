/**
 * `gaia install-app` (PLAN 9.1): generates Gaia.app from `resources/app-bundle/` in a staging folder beside its place, builds the launcher
 * stub as a universal binary and signs the bundle ad hoc through process-run, and only then moves it into place, so a failed install leaves
 * the bundle that was there as it was. An application of the same name that Gaia did not install is left alone.
 */
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { AppBundleInfoFile, appBundleFolderName } from '../../adapters/app-bundle/AppBundleInfoFile.ts';
import type { ProcessRun, ProgramRunAnswer }      from '../../lib/process-run/ProcessRun.ts';
import { GAIA_INSTALL_VERSION }                   from '../../shared/constants/InstallVersion.ts';
import { PRODUCT_NAMES }                          from '../../shared/constants/ProductNames.ts';
import { BundleTemplateUtil, type BundleValues }  from './utils/BundleTemplateUtil.ts';

export interface AppInstallOptions {
  /** Where the bundle is placed, `~/Applications` (PLAN 13, Q10); made when it does not exist. */
  readonly applicationsFolder:    string;
  /** `resources/app-bundle/`: the templates, the launcher's source and the icon. */
  readonly bundleResourcesFolder: string;
  /** The repository the launch script runs Gaia from, and the Bun that installs it, which the script looks for first. */
  readonly repositoryPath:        string;
  readonly bunProgram:            string;
  readonly gaiaVersion:           string;
  readonly processRun:            ProcessRun;
}

export type AppInstallFailure = 'templates-unreadable' | 'bundle-unwritable' | 'compile-failed' | 'signing-failed' | 'bundle-not-placed';

export type AppInstallVerdict =
  | { readonly verdict: 'installed'; readonly appBundlePath: string; readonly replacedAnEarlierInstall: boolean }
  | { readonly verdict: 'refused'; readonly refusal: 'another-application-in-place'; readonly appBundlePath: string }
  | { readonly verdict: 'unrepaired'; readonly failure: AppInstallFailure; readonly appBundlePath: string; readonly detail: string };

export interface AppInstall {
  readonly install: () => Promise<AppInstallVerdict>;
}

/** The oldest macOS the launcher is compiled for, and the plist's `LSMinimumSystemVersion`. */
const MINIMUM_SYSTEM_VERSION = '12.0';
/** Bounds each step of the launcher's build; the first compile after an update of the developer tools prepares their caches. */
const COMPILE_TIMEOUT_MILLISECONDS = 120_000;
const SIGNING_TIMEOUT_MILLISECONDS = 60_000;

const COMPILER_PROGRAM = '/usr/bin/clang';
const JOINING_PROGRAM = '/usr/bin/lipo';
const SIGNING_PROGRAM = '/usr/bin/codesign';
const LAUNCHER_SOURCE_FILE_NAME = 'launch.c';
const INFO_PLIST_TEMPLATE_FILE_NAME = 'Info.plist.template';
const LAUNCH_SCRIPT_TEMPLATE_FILE_NAME = 'launch.sh.template';
const LAUNCHER_EXECUTABLE_NAME = 'launch';
const LAUNCH_SCRIPT_FILE_NAME = 'launch.sh';
const ICON_FILE_NAME = `${PRODUCT_NAMES.applicationName}.icns`;
const STAGING_FOLDER_NAME = `.${PRODUCT_NAMES.applicationName}.app.installing`;
const EARLIER_INSTALL_FOLDER_NAME = 'earlier-install.app';
const EXECUTABLE_FILE_MODE = 0o755;
const MILLISECONDS_PER_SECOND = 1_000;

/** The launcher runs on both kinds of Mac. */
const LAUNCHER_ARCHITECTURES = ['arm64', 'x86_64'] as const;

interface LauncherBuildRun {
  readonly program:          string;
  readonly programArguments: readonly string[];
}

/**
 * One compile per architecture, joined into one universal binary: a compile for both at once leaves empty folders behind in the temporary
 * folder. Each runs in the staging folder on paths relative to it, so a call is the same wherever Gaia installs and its recording holds.
 */
function launcherBuildRunsOf(): readonly LauncherBuildRun[] {
  const architectureBuildName = (architecture: string): string => `${LAUNCHER_EXECUTABLE_NAME}-${architecture}`;
  const compileRuns = LAUNCHER_ARCHITECTURES.map((architecture) => ({
    program:          COMPILER_PROGRAM,
    programArguments: [
      '-arch',
      architecture,
      `-mmacosx-version-min=${MINIMUM_SYSTEM_VERSION}`,
      '-Os',
      '-Wall',
      '-Werror',
      '-o',
      architectureBuildName(architecture),
      LAUNCHER_SOURCE_FILE_NAME,
    ],
  }));
  const joinRun = {
    program:          JOINING_PROGRAM,
    programArguments: ['-create', '-output', `${appBundleFolderName()}/Contents/MacOS/${LAUNCHER_EXECUTABLE_NAME}`, ...LAUNCHER_ARCHITECTURES.map(architectureBuildName)],
  };
  return [...compileRuns, joinRun];
}

function signingArgumentsOf(): readonly string[] {
  return ['--force', '--deep', '--sign', '-', appBundleFolderName()];
}

interface FilledTemplates {
  readonly infoPlist:    string;
  readonly launchScript: string;
}

interface StepFailed {
  readonly verdict: 'failed';
  readonly failure: AppInstallFailure;
  readonly detail:  string;
}

function stepFailed(failure: AppInstallFailure, detail: string): StepFailed {
  return { verdict: 'failed', failure, detail };
}

/** The system's error code, `ENOENT` and its kin, or the message when the failure carries none. */
function failureTextOf(error: unknown): string {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.message;
  return String(error);
}

function runFailureDetailOf(program: string, answer: ProgramRunAnswer, timeoutMilliseconds: number): string | null {
  switch (answer.verdict) {
    case 'finished':
      if (answer.exitCode === 0) return null;
      return `${program} exited ${answer.exitCode}: ${answer.standardError.trim() || answer.standardOutput.trim()}`;
    case 'not-found':
      return answer.missing === 'program' ? `no program at ${program}` : 'the staging folder is gone';
    case 'timed-out':
      return `${program} did not finish within ${timeoutMilliseconds / MILLISECONDS_PER_SECOND} seconds`;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The sentence `gaia install-app` prints for a refusal or a failure. */
export function appInstallMessageOf(verdict: Exclude<AppInstallVerdict, { readonly verdict: 'installed' }>): string {
  if (verdict.verdict === 'refused') return `Another application is installed at ${verdict.appBundlePath}. Gaia leaves it in place and installs nothing.`;
  switch (verdict.failure) {
    case 'templates-unreadable': return `Gaia cannot read the templates of its app bundle: ${verdict.detail}.`;
    case 'bundle-unwritable': return `Gaia cannot write its app bundle beside ${verdict.appBundlePath}: ${verdict.detail}.`;
    case 'compile-failed': return `The launcher of ${appBundleFolderName()} did not compile, so nothing is installed. ${verdict.detail}`;
    case 'signing-failed': return `${appBundleFolderName()} could not be signed, so nothing is installed. ${verdict.detail}`;
    case 'bundle-not-placed': return `${appBundleFolderName()} could not be placed at ${verdict.appBundlePath}: ${verdict.detail}.`;
  }
}

export function createAppInstall(options: AppInstallOptions): AppInstall {
  const appBundlePath  = join(options.applicationsFolder, appBundleFolderName());
  const stagingFolder  = join(options.applicationsFolder, STAGING_FOLDER_NAME);
  const stagedBundle   = join(stagingFolder, appBundleFolderName());
  const earlierInstall = join(stagingFolder, EARLIER_INSTALL_FOLDER_NAME);

  async function filledTemplates(): Promise<FilledTemplates | StepFailed> {
    const values: BundleValues = {
      repositoryPath:       options.repositoryPath,
      bunProgram:           options.bunProgram,
      gaiaVersion:          options.gaiaVersion,
      installVersion:       GAIA_INSTALL_VERSION,
      minimumSystemVersion: MINIMUM_SYSTEM_VERSION,
    };
    let infoPlistTemplate: string;
    let launchScriptTemplate: string;
    try {
      infoPlistTemplate    = await readFile(join(options.bundleResourcesFolder, INFO_PLIST_TEMPLATE_FILE_NAME), 'utf8');
      launchScriptTemplate = await readFile(join(options.bundleResourcesFolder, LAUNCH_SCRIPT_TEMPLATE_FILE_NAME), 'utf8');
    } catch (error) {
      return stepFailed('templates-unreadable', failureTextOf(error));
    }
    const infoPlist    = BundleTemplateUtil.infoPlistOf(infoPlistTemplate, values);
    const launchScript = BundleTemplateUtil.launchScriptOf(launchScriptTemplate, values);
    const unfilledDetail = (templateFileName: string, placeholders: readonly string[]): string => `${templateFileName} has no value for ${placeholders.join(', ')}`;
    if (infoPlist.verdict === 'unfilled') return stepFailed('templates-unreadable', unfilledDetail(INFO_PLIST_TEMPLATE_FILE_NAME, infoPlist.placeholders));
    if (launchScript.verdict === 'unfilled') return stepFailed('templates-unreadable', unfilledDetail(LAUNCH_SCRIPT_TEMPLATE_FILE_NAME, launchScript.placeholders));
    return { infoPlist: infoPlist.text, launchScript: launchScript.text };
  }

  /** A bundle of that name whose plist carries no install version of Gaia's is another application's. */
  async function anotherApplicationIsInPlace(): Promise<boolean> {
    if (!await pathExists(appBundlePath)) return false;
    return (await new AppBundleInfoFile(appBundlePath).read()).verdict !== 'readable';
  }

  /** The bundle without its launcher, and the launcher's source beside it; a staging folder an earlier install left is cleared first. */
  async function writeStagedBundle(templates: FilledTemplates): Promise<StepFailed | null> {
    const contentsFolder = join(stagedBundle, 'Contents');
    try {
      await rm(stagingFolder, { recursive: true, force: true });
      await mkdir(join(contentsFolder, 'MacOS'), { recursive: true });
      await mkdir(join(contentsFolder, 'Resources'), { recursive: true });
      await writeFile(join(contentsFolder, 'Info.plist'), templates.infoPlist);
      await writeFile(join(contentsFolder, 'MacOS', LAUNCH_SCRIPT_FILE_NAME), templates.launchScript);
      await chmod(join(contentsFolder, 'MacOS', LAUNCH_SCRIPT_FILE_NAME), EXECUTABLE_FILE_MODE);
      await copyFile(join(options.bundleResourcesFolder, ICON_FILE_NAME), join(contentsFolder, 'Resources', ICON_FILE_NAME));
      await copyFile(join(options.bundleResourcesFolder, LAUNCHER_SOURCE_FILE_NAME), join(stagingFolder, LAUNCHER_SOURCE_FILE_NAME));
      return null;
    } catch (error) {
      return stepFailed('bundle-unwritable', failureTextOf(error));
    }
  }

  async function runInStaging(program: string, programArguments: readonly string[], timeoutMilliseconds: number, failure: AppInstallFailure): Promise<StepFailed | null> {
    const answer = await options.processRun.run({
      program, programArguments, workingDirectory: stagingFolder, timeoutMilliseconds
    });
    const failureDetail = runFailureDetailOf(program, answer, timeoutMilliseconds);
    return failureDetail === null ? null : stepFailed(failure, failureDetail);
  }

  /**
   * Moves the earlier install aside first, since a folder is not renamed over another, and puts it back when the new one cannot take its
   * place. One that cannot go back stays in the staging folder, which is then kept, and the failure says where it is.
   */
  async function placeStagedBundle(): Promise<{ readonly earlierInstallWasReplaced: boolean } | StepFailed> {
    const earlierInstallExists = await pathExists(appBundlePath);
    try {
      if (earlierInstallExists) await rename(appBundlePath, earlierInstall);
    } catch (error) {
      return stepFailed('bundle-not-placed', failureTextOf(error));
    }
    try {
      await rename(stagedBundle, appBundlePath);
      return { earlierInstallWasReplaced: earlierInstallExists };
    } catch (error) {
      if (!earlierInstallExists) return stepFailed('bundle-not-placed', failureTextOf(error));
      try {
        await rename(earlierInstall, appBundlePath);
        return stepFailed('bundle-not-placed', failureTextOf(error));
      } catch {
        return stepFailed('bundle-not-placed', `${failureTextOf(error)}, and the earlier install is kept at ${earlierInstall}`);
      }
    }
  }

  async function earlierInstallIsStranded(): Promise<boolean> {
    return await pathExists(earlierInstall) && !await pathExists(appBundlePath);
  }

  /** An earlier install a failed placement stranded in the staging folder goes back first, since writing the staged bundle clears that folder. */
  async function restoreStrandedEarlierInstall(): Promise<StepFailed | null> {
    if (!await earlierInstallIsStranded()) return null;
    try {
      await rename(earlierInstall, appBundlePath);
      return null;
    } catch (error) {
      return stepFailed('bundle-not-placed', `the earlier install kept at ${earlierInstall} cannot go back: ${failureTextOf(error)}`);
    }
  }

  async function buildLauncher(): Promise<StepFailed | null> {
    for (const buildRun of launcherBuildRunsOf()) {
      const failedRun = await runInStaging(buildRun.program, buildRun.programArguments, COMPILE_TIMEOUT_MILLISECONDS, 'compile-failed');
      if (failedRun !== null) return failedRun;
    }
    return null;
  }

  async function installFromStaging(templates: FilledTemplates): Promise<AppInstallVerdict> {
    const failedStep = await writeStagedBundle(templates)
      ?? await buildLauncher()
      ?? await runInStaging(SIGNING_PROGRAM, signingArgumentsOf(), SIGNING_TIMEOUT_MILLISECONDS, 'signing-failed');
    const placement = failedStep ?? await placeStagedBundle();
    if ('verdict' in placement) return unrepairedOf(placement);
    return { verdict: 'installed', appBundlePath, replacedAnEarlierInstall: placement.earlierInstallWasReplaced };
  }

  function unrepairedOf(failedStep: StepFailed): AppInstallVerdict {
    return {
      verdict: 'unrepaired',
      failure: failedStep.failure,
      appBundlePath,
      detail:  failedStep.detail,
    };
  }

  async function install(): Promise<AppInstallVerdict> {
    const templates = await filledTemplates();
    if ('verdict' in templates) return unrepairedOf(templates);
    const failedRestore = await restoreStrandedEarlierInstall();
    if (failedRestore !== null) return unrepairedOf(failedRestore);
    if (await anotherApplicationIsInPlace()) return { verdict: 'refused', refusal: 'another-application-in-place', appBundlePath };
    try {
      await mkdir(options.applicationsFolder, { recursive: true });
    } catch (error) {
      return unrepairedOf(stepFailed('bundle-unwritable', failureTextOf(error)));
    }
    try {
      return await installFromStaging(templates);
    } finally {
      if (!await earlierInstallIsStranded()) await rm(stagingFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return { install };
}
