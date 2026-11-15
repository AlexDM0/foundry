/**
 * `pipeline constitution <S>`: User's whole constitution text, from a file or standard input (`--file -`), byte for byte, and the SOURCES
 * ticks, at the revision User saw. A source the agent named stays on a line only while the text still holds that line.
 */
import { readFileSync } from 'node:fs';
import { resolve }      from 'node:path';

import type { ConstitutionSources }                         from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { OperationRefusal }                                 from '../../src/shared/OperationRefusal.ts';
import type { CommandContext }                              from '../CommandContext.ts';
import { requirePipedStandardInput, STANDARD_INPUT_MARKER } from '../PipedStandardInput.ts';
import { refuseUsage }                                      from '../RecordedIncidentMove.ts';
import { suppliedTextOf }                                   from '../SuppliedText.ts';
import type { ArgumentParser }                              from '../arguments/ArgumentParser.ts';
import { applySetupCommand, revisionFrom, setupIdOf }       from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                   from './constants/PipelineUsage.ts';

const NO_SOURCES_WORD = 'none';

/** The SOURCES ticks by the word a command line names each with. */
const SOURCE_OF_WORD: Readonly<Record<string, keyof ConstitutionSources>> = {
  'contributing':      'contributing',
  'research':          'research',
  'installed-default': 'installedDefault',
};

async function markdownFrom(commandArguments: ArgumentParser, context: CommandContext): Promise<string | undefined> {
  const file = commandArguments.option('file');
  if (file === undefined) return undefined;
  if (file === STANDARD_INPUT_MARKER) {
    requirePipedStandardInput(context, 'file');
    return suppliedTextOf(await context.readStandardInputBytes(), 'Standard input for --file -');
  }
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(resolve(context.currentDirectory, file));
  } catch (problem) {
    throw new OperationRefusal('refused', `--file ${file} could not be read: ${problem instanceof Error ? problem.message : String(problem)}`);
  }
  return suppliedTextOf(bytes, `--file ${file}`);
}

/** The sources named are ticked and the others not; `none` unticks all three. */
function sourcesFrom(commandArguments: ArgumentParser, usage: string): ConstitutionSources | undefined {
  const written = commandArguments.option('sources');
  if (written === undefined) return undefined;
  const words = written === NO_SOURCES_WORD ? [] : written.split(',').map((word) => word.trim());
  const sources: ConstitutionSources = { contributing: false, research: false, installedDefault: false };
  for (const word of words) {
    const source = Object.hasOwn(SOURCE_OF_WORD, word) ? SOURCE_OF_WORD[word] : undefined;
    if (source === undefined) refuseUsage(`Name the sources from ${Object.keys(SOURCE_OF_WORD).join(', ')}, or none.`, usage);
    sources[source] = true;
  }
  return sources;
}

export async function editPipelineConstitution(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.constitution;
  commandArguments.rejectUnknownOptions(['revision', 'file', 'sources', 'json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const setupId     = setupIdOf(commandArguments.positionals()[1], usage);
  const revision    = revisionFrom(commandArguments, usage);
  const draftedFrom = sourcesFrom(commandArguments, usage);
  const markdown    = await markdownFrom(commandArguments, context);
  if (markdown === undefined && draftedFrom === undefined) refuseUsage('Give the text with --file, the sources with --sources, or both.', usage);
  await applySetupCommand(commandArguments, context, {
    kind: 'pipeline-constitution-edit',
    setupId,
    revision,
    ...(markdown === undefined ? {} : { markdown }),
    ...(draftedFrom === undefined ? {} : { draftedFrom }),
  });
}
