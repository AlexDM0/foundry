#!/usr/bin/env bun
/** The one entry point: reads the verb, runs it, and maps the app-level error to an exit code. Only this file exits. */
import { mkdir }                from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join }                 from 'node:path';

import packageManifest from '../package.json' with { type: 'json' };

import { AppBundleInfoFile, applicationsFolderIn }                       from './adapters/app-bundle/AppBundleInfoFile.ts';
import { createForgeProgram }                                            from './adapters/forge-program/ForgeProgram.ts';
import { RegistryFile, registryFilePathIn }                              from './adapters/forge-registry/RegistryFile.ts';
import { ServerTokenFile }                                               from './adapters/gaia-files/ServerTokenFile.ts';
import { SettingsFile }                                                  from './adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                                          from './adapters/gaia-files/SettingsWriter.ts';
import { realGaiaServerClient }                                          from './adapters/gaia-server/GaiaServerClient.ts';
import { createPathChooser }                                             from './adapters/path-chooser/PathChooser.ts';
import { appInstallMessageOf, createAppInstall, type AppInstallVerdict } from './features/app-install/AppInstall.ts';
import { fleetSnapshotOf }                                               from './features/fleet/FleetAssembly.ts';
import { createForgeControl }                                            from './features/forge-control/ForgeControl.ts';
import { foundBrowserIn }                                                from './features/launcher/BrowserFinder.ts';
import { browserWindowWatchOver }                                        from './features/launcher/BrowserWindowWatch.ts';
import { createLauncher, launchMessageOf, type LaunchVerdict }           from './features/launcher/Launcher.ts';
import { startPageServer, type PageServerStartVerdict }                  from './features/page-server/PageServer.ts';
import { builtPageFilesOf, pageIndexFilePath }                           from './features/page-server/routes/PageFilesRoute.ts';
import { forgeClientOf }                                                 from './lib/forge-client/ForgeClient.ts';
import { realOverseerFetch }                                             from './lib/forge-client/OverseerFetch.ts';
import { realProcessRun }                                                from './lib/process-run/ProcessRun.ts';
import { realClockTimers, stampOfNow }                                   from './services/Clock.ts';
import { environmentCopy, gaiaPort, homeDirectory }                      from './services/Environment.ts';
import { createFleetStore }                                              from './services/FleetStore.ts';
import { createForgeWatch }                                              from './services/ForgeWatch.ts';
import { createSettingsStore }                                           from './services/SettingsStore.ts';
import type { FleetSnapshot }                                            from './shared/@types/FleetSnapshot.ts';
import { GaiaError }                                                     from './shared/GaiaError.ts';
import { CONTRACT_VERSIONS }                                             from './shared/constants/ContractVersions.ts';
import { GAIA_INSTALL_VERSION }                                          from './shared/constants/InstallVersion.ts';
import { PRODUCT_NAMES }                                                 from './shared/constants/ProductNames.ts';

export interface ProgramOutput {
  readonly writeStandardOutput: (text: string) => void;
  readonly writeStandardError:  (text: string) => void;
}

export type ExitCode = 0 | 1 | 2;

const EXIT_CODE_FOR_REFUSAL: ExitCode   = 1;
const EXIT_CODE_FOR_UNREPAIRED: ExitCode = 2;

const USAGE_TEXT = [
  `Usage: ${PRODUCT_NAMES.programName} <verb> [--json]`,
  '',
  'Verbs:',
  '  launch       open Gaia\'s window, starting its server when none runs, and stop that server when the window closes',
  '  serve        serve Gaia\'s page and its API on 127.0.0.1 until stopped by a signal',
  '  install-app  install Gaia.app into ~/Applications, which opens Gaia\'s window from the Finder, Launchpad or Spotlight',
  '  version      the version of Gaia and of the app bundle contract it installs',
  '  help         this text',
].join('\n');

type VerbRun = (remainingArguments: readonly string[], output: ProgramOutput) => Promise<ExitCode>;

async function printVersion(remainingArguments: readonly string[], output: ProgramOutput): Promise<ExitCode> {
  const versionAnswer = {
    answerVersion:  CONTRACT_VERSIONS.gaiaProgramAnswer,
    gaiaVersion:    packageManifest.version,
    installVersion: GAIA_INSTALL_VERSION,
  };
  output.writeStandardOutput(remainingArguments.includes('--json')
    ? `${JSON.stringify(versionAnswer)}\n`
    : `${PRODUCT_NAMES.programName} ${versionAnswer.gaiaVersion} (install version ${versionAnswer.installVersion})\n`);
  return 0;
}

async function printUsage(_remainingArguments: readonly string[], output: ProgramOutput): Promise<ExitCode> {
  output.writeStandardOutput(`${USAGE_TEXT}\n`);
  return 0;
}

/** The signals that end `serve` and `launch`: Ctrl-C in a terminal, and the launcher's stop of the server it started. */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

interface StopSignalWatch {
  readonly untilAStopSignal: Promise<void>;
  /** Stops listening without a signal, as a verb that ended by itself does. */
  readonly release:          () => void;
}

function watchStopSignals(): StopSignalWatch {
  let release: () => void = () => undefined;
  const untilAStopSignal = new Promise<void>((resolve) => {
    const stop = (): void => {
      release();
      resolve();
    };
    release = () => {
      for (const signal of STOP_SIGNALS) process.off(signal, stop);
    };
    for (const signal of STOP_SIGNALS) process.on(signal, stop);
  });
  return { untilAStopSignal, release };
}

function refusalOfStart(startVerdict: Exclude<PageServerStartVerdict, { readonly verdict: 'serving' }>): GaiaError {
  if (startVerdict.verdict === 'gaia-already-serving') {
    return new GaiaError('refused', startVerdict.verdict, `${PRODUCT_NAMES.applicationName} already serves at ${startVerdict.url.href}.`);
  }
  if (startVerdict.verdict === 'port-unavailable') {
    return new GaiaError('refused', startVerdict.verdict, `${PRODUCT_NAMES.applicationName} cannot listen on port ${startVerdict.port}: ${startVerdict.failure}.`);
  }
  const fileName = startVerdict.file === 'token' ? 'token' : 'server record';
  return new GaiaError('unrepaired', startVerdict.verdict, `${PRODUCT_NAMES.applicationName} cannot write its ${fileName}: ${startVerdict.failure}.`);
}

/**
 * Wires the forge watch and the settings into the fleet store and forge-control into the command port, serves both to the page, and
 * stops it all at a stop signal.
 */
async function serve(_remainingArguments: readonly string[], output: ProgramOutput): Promise<ExitCode> {
  const port = gaiaPort();
  if (port === null) throw new GaiaError('refused', 'port-invalid', `${PRODUCT_NAMES.environmentPrefix}PORT names no port Gaia can listen on.`);
  const home = homeDirectory();
  const registryPath = registryFilePathIn(home);
  const settingsStore = createSettingsStore({ settingsFile: new SettingsFile(home), settingsWriter: createSettingsWriter(home) });
  await settingsStore.load();
  let address = `http://127.0.0.1:${port}`;

  const readRegistry = () => new RegistryFile(registryPath).read();
  const forgeClient = forgeClientOf({ overseerFetch: realOverseerFetch() });
  const forgeWatch = createForgeWatch({
    readRegistry,
    forgeClient,
    hiddenTrackerIds:  () => settingsStore.settings().hiddenTrackerIds,
    timers:            realClockTimers(),
    now:               stampOfNow,
    onReadingsChanged: () => publishSnapshot(),
  });
  const snapshotNow = (): FleetSnapshot => fleetSnapshotOf({
    readings: forgeWatch.readings(),
    machine:  { cpuCount: availableParallelism() },
    settings: settingsStore.settings(),
    gaia:     {
      gaiaVersion:       packageManifest.version,
      address,
      homeFolder:        home,
      registryPath,
      forgeProgramInUse: settingsStore.settings().forgeProgramPath,
      settingsFile:      settingsStore.fileState(),
      knownContracts:    {
        summary: CONTRACT_VERSIONS.forgeBoardSummary,
        monitor: CONTRACT_VERSIONS.forgeMonitor,
        control: CONTRACT_VERSIONS.forgeControl,
        embed:   CONTRACT_VERSIONS.forgeEmbedChannel,
      },
    },
  });
  const fleetStore = createFleetStore(snapshotNow());

  function publishSnapshot(): void {
    fleetStore.publish(snapshotNow());
  }

  const processRun = realProcessRun(environmentCopy);
  const forgeControl = createForgeControl({
    readRegistry,
    readings:     forgeWatch.readings,
    forgeClient,
    forgeProgram: createForgeProgram({ processRun, settingsProgramPath: () => settingsStore.settings().forgeProgramPath }),
    settingsStore,
    pathChooser:  createPathChooser({ processRun, workingDirectory: () => home }),
    lookAgain:    forgeWatch.lookAgain,
  });

  const startVerdict = await startPageServer({
    port,
    homeDirectory:       home,
    fleetStore,
    forgeCounts:         () => ({ forgesRegistered: forgeWatch.watchedForgeCount(), forgesAnswered: forgeWatch.readings().length }),
    pageFiles:           builtPageFilesOf(pageIndexFilePath()),
    carryCommand:        forgeControl.carry,
    frameSessionSources: { readRegistry, readings: forgeWatch.readings, forgeClient },
    timers:              realClockTimers(),
    now:                 stampOfNow,
    processId:           process.pid,
  });
  if (startVerdict.verdict !== 'serving') throw refusalOfStart(startVerdict);
  const { pageServer } = startVerdict;
  address = pageServer.url.origin;
  const unsubscribeFromSettings = settingsStore.subscribe(publishSnapshot);
  publishSnapshot();
  forgeWatch.start();
  output.writeStandardOutput(`${PRODUCT_NAMES.applicationName} serves ${pageServer.url.href}\n`);

  await watchStopSignals().untilAStopSignal;
  unsubscribeFromSettings();
  forgeWatch.stop();
  await pageServer.stop();
  return 0;
}

const BROWSER_PROFILE_FOLDER_NAME = 'browser-profile';

/** Gaia's data folder is owner-only, since it holds the token; the browser would make it open to all if it came first. */
const OWNER_ONLY_FOLDER_MODE = 0o700;

/** A launch that did not close normally, as the app-level error: a refusal User can act on, or a failure Gaia will not repair. */
export function launchErrorOf(verdict: Exclude<LaunchVerdict, { readonly verdict: 'closed' }>, port: number): GaiaError {
  const reason = verdict.verdict === 'refused' ? verdict.refusal : verdict.failure;
  return new GaiaError(verdict.verdict, reason, launchMessageOf(verdict, port));
}

/** The flag with which Gaia.app's launch script names the bundle it runs from, so the launcher checks the bundle's install version. */
const APP_BUNDLE_FLAG = '--app-bundle';

/** The bundle a launch names, `null` for a launch with no bundle, as from a terminal. */
export function appBundlePathAmong(remainingArguments: readonly string[]): string | null {
  const flagIndex = remainingArguments.indexOf(APP_BUNDLE_FLAG);
  if (flagIndex === -1) return null;
  const appBundlePath = remainingArguments[flagIndex + 1];
  if (appBundlePath === undefined || appBundlePath === '') throw new GaiaError('refused', 'app-bundle-unnamed', `${APP_BUNDLE_FLAG} names no app bundle.`);
  return appBundlePath;
}

/** Wires the launcher (PLAN 9.2) to the real programs, browser and server; the launcher itself shows its dialogs. */
async function launch(remainingArguments: readonly string[], _output: ProgramOutput): Promise<ExitCode> {
  const port = gaiaPort();
  if (port === null) throw new GaiaError('refused', 'port-invalid', `${PRODUCT_NAMES.environmentPrefix}PORT names no port Gaia can listen on.`);
  const appBundlePath = appBundlePathAmong(remainingArguments);
  const home = homeDirectory();
  const browserProfileFolder = join(home, PRODUCT_NAMES.dataFolderName, BROWSER_PROFILE_FOLDER_NAME);
  try {
    await mkdir(join(home, PRODUCT_NAMES.dataFolderName), { recursive: true, mode: OWNER_ONLY_FOLDER_MODE });
  } catch (error) {
    throw new GaiaError('unrepaired', 'data-folder-unwritable', `${PRODUCT_NAMES.applicationName} cannot make its data folder: ${String(error)}.`);
  }
  const stopSignals = watchStopSignals();
  const verdict = await createLauncher({
    port,
    appBundleInfo:      appBundlePath === null ? null : await new AppBundleInfoFile(appBundlePath).read(),
    serverProgram:      { program: process.execPath, programArguments: [join(import.meta.dir, 'Main.ts'), 'serve'], workingDirectory: join(import.meta.dir, '..') },
    browserProfileFolder,
    splashPagePath:     join(import.meta.dir, '..', 'resources', 'page', 'loading.html'),
    theme:              (await new SettingsFile(home).read()).settings.theme,
    workingDirectory:   home,
    findBrowser:        () => foundBrowserIn(home),
    processRun:         realProcessRun(environmentCopy),
    browserWindowWatchOver,
    gaiaServer:         realGaiaServerClient(),
    readServerToken:    () => new ServerTokenFile(home).read(),
    timers:             realClockTimers(),
    untilStopRequested: stopSignals.untilAStopSignal,
  }).launch();
  stopSignals.release();
  if (verdict.verdict !== 'closed') throw launchErrorOf(verdict, port);
  return 0;
}

/** An install that did not finish, as the app-level error: a refusal User can act on, or a failure Gaia will not repair. */
export function appInstallErrorOf(verdict: Exclude<AppInstallVerdict, { readonly verdict: 'installed' }>): GaiaError {
  const reason = verdict.verdict === 'refused' ? verdict.refusal : verdict.failure;
  return new GaiaError(verdict.verdict, reason, appInstallMessageOf(verdict));
}

/** Wires the install of Gaia.app (PLAN 9.1) to the real compiler, joiner and signer, for this repository and the Bun that runs it. */
async function installApp(_remainingArguments: readonly string[], output: ProgramOutput): Promise<ExitCode> {
  const repositoryPath = join(import.meta.dir, '..');
  const verdict = await createAppInstall({
    applicationsFolder:    applicationsFolderIn(homeDirectory()),
    bundleResourcesFolder: join(repositoryPath, 'resources', 'app-bundle'),
    repositoryPath,
    bunProgram:            process.execPath,
    gaiaVersion:           packageManifest.version,
    processRun:            realProcessRun(environmentCopy),
  }).install();
  if (verdict.verdict !== 'installed') throw appInstallErrorOf(verdict);
  output.writeStandardOutput(`${PRODUCT_NAMES.applicationName} is installed at ${verdict.appBundlePath}; it opens Gaia's window from the Finder, Launchpad or Spotlight.\n`);
  return 0;
}

const VERB_RUNS: Readonly<Record<string, VerbRun>> = {
  launch,
  serve,
  'install-app': installApp,
  version:       printVersion,
  help:          printUsage,
};

function verbRunFor(verb: string): VerbRun | null {
  return Object.hasOwn(VERB_RUNS, verb) ? VERB_RUNS[verb] ?? null : null;
}

/** A refusal User can act on exits 1; a failure Gaia will not repair exits 2. */
export function exitCodeOf(error: GaiaError): ExitCode {
  return error.kind === 'refused' ? EXIT_CODE_FOR_REFUSAL : EXIT_CODE_FOR_UNREPAIRED;
}

export async function runGaia(commandArguments: readonly string[], output: ProgramOutput): Promise<ExitCode> {
  const [verb = 'help', ...remainingArguments] = commandArguments;
  const verbRun = verbRunFor(verb);
  if (verbRun === null) {
    output.writeStandardError(`${PRODUCT_NAMES.programName} does not know the verb "${verb}".\n\n${USAGE_TEXT}\n`);
    return EXIT_CODE_FOR_REFUSAL;
  }
  try {
    return await verbRun(remainingArguments, output);
  } catch (error) {
    if (!(error instanceof GaiaError)) throw error;
    output.writeStandardError(`${error.message}\n`);
    return exitCodeOf(error);
  }
}

if (import.meta.main) {
  const exitCode = await runGaia(process.argv.slice(2), {
    writeStandardOutput: (text) => process.stdout.write(text),
    writeStandardError:  (text) => process.stderr.write(text),
  });
  process.exit(exitCode);
}
