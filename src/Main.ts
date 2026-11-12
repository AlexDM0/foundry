#!/usr/bin/env bun
/** The one entry point: reads the verb, runs it, and maps the app-level error to an exit code. Only this file exits. */
import { availableParallelism } from 'node:os';

import packageManifest from '../package.json' with { type: 'json' };

import { createForgeProgram }                           from './adapters/forge-program/ForgeProgram.ts';
import { RegistryFile, registryFilePathIn }             from './adapters/forge-registry/RegistryFile.ts';
import { SettingsFile }                                 from './adapters/gaia-files/SettingsFile.ts';
import { createSettingsWriter }                         from './adapters/gaia-files/SettingsWriter.ts';
import { createPathChooser }                            from './adapters/path-chooser/PathChooser.ts';
import { fleetSnapshotOf }                              from './features/fleet/FleetAssembly.ts';
import { createForgeControl }                           from './features/forge-control/ForgeControl.ts';
import { startPageServer, type PageServerStartVerdict } from './features/page-server/PageServer.ts';
import { builtPageFilesOf, pageIndexFilePath }          from './features/page-server/routes/PageFilesRoute.ts';
import { forgeClientOf }                                from './lib/forge-client/ForgeClient.ts';
import { realOverseerFetch }                            from './lib/forge-client/OverseerFetch.ts';
import { realProcessRun }                               from './lib/process-run/ProcessRun.ts';
import { stampOfNow }                                   from './services/Clock.ts';
import { environmentCopy, gaiaPort, homeDirectory }     from './services/Environment.ts';
import { createFleetStore }                             from './services/FleetStore.ts';
import { createForgeWatch, realWatchTimers }            from './services/ForgeWatch.ts';
import { createSettingsStore }                          from './services/SettingsStore.ts';
import type { FleetSnapshot }                           from './shared/@types/FleetSnapshot.ts';
import { GaiaError }                                    from './shared/GaiaError.ts';
import { CONTRACT_VERSIONS }                            from './shared/constants/ContractVersions.ts';
import { GAIA_INSTALL_VERSION }                         from './shared/constants/InstallVersion.ts';
import { PRODUCT_NAMES }                                from './shared/constants/ProductNames.ts';

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
  '  serve     serve Gaia\'s page and its API on 127.0.0.1 until stopped by a signal',
  '  version   the version of Gaia and of the app bundle contract it installs',
  '  help      this text',
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

/** The signals that end `serve`: Ctrl-C in a terminal, and the launcher's stop of the server it started. */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function untilAStopSignal(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      for (const signal of STOP_SIGNALS) process.off(signal, stop);
      resolve();
    };
    for (const signal of STOP_SIGNALS) process.on(signal, stop);
  });
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
    timers:            realWatchTimers(),
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
    timers:              realWatchTimers(),
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

  await untilAStopSignal();
  unsubscribeFromSettings();
  forgeWatch.stop();
  await pageServer.stop();
  return 0;
}

const VERB_RUNS: Readonly<Record<string, VerbRun>> = {
  serve,
  version: printVersion,
  help:    printUsage,
};

function verbRunFor(verb: string): VerbRun | null {
  return Object.hasOwn(VERB_RUNS, verb) ? VERB_RUNS[verb] ?? null : null;
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
    return error.kind === 'refused' ? EXIT_CODE_FOR_REFUSAL : EXIT_CODE_FOR_UNREPAIRED;
  }
}

if (import.meta.main) {
  const exitCode = await runGaia(process.argv.slice(2), {
    writeStandardOutput: (text) => process.stdout.write(text),
    writeStandardError:  (text) => process.stderr.write(text),
  });
  process.exit(exitCode);
}
