#!/usr/bin/env bun
/** The one entry point: reads the verb, runs it, and maps the app-level error to an exit code. Only this file exits. */
import packageManifest from '../package.json' with { type: 'json' };

import { GaiaError }            from './shared/GaiaError.ts';
import { CONTRACT_VERSIONS }    from './shared/constants/ContractVersions.ts';
import { GAIA_INSTALL_VERSION } from './shared/constants/InstallVersion.ts';
import { PRODUCT_NAMES }        from './shared/constants/ProductNames.ts';

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

const VERB_RUNS: Readonly<Record<string, VerbRun>> = {
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
