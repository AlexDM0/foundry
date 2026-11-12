/**
 * What the pipeline agent's verbs share. Under its job a verb names no setup record: the Overseer stamps the one the agent serves. Outside
 * a job User names the record first. The payload is JSON after `--`, or in a file or standard input with `--file`, read through the same
 * closed schema the applier reads it with, so a misshapen payload is refused before it is relayed.
 */
import { readFileSync } from 'node:fs';
import { resolve }      from 'node:path';

import type { PayloadReading }           from '../../src/adapters/pipeline-setup/SetupPayloadSchemas.ts';
import type { PipelineAgentControlKind } from '../../src/services/control/PipelineAgentControls.ts';
import type { ControlCommandKind }       from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }              from '../../src/shared/OperationRefusal.ts';
import type { CommandContext }           from '../CommandContext.ts';
import { refuseUsage }                   from '../RecordedIncidentMove.ts';
import { suppliedTextOf }                from '../SuppliedText.ts';
import type { ArgumentParser }           from '../arguments/ArgumentParser.ts';
import { setupIdOf }                     from './SetupCommandLine.ts';

const STANDARD_INPUT_MARKER = '-';

/** Each verb's own word comes first; outside a job the setup record follows it. */
const VERB_WORD_COUNT = 1;

/** The record the command names: none under a job, where the Overseer stamps it. */
export interface AgentSetupNaming {
  setupId?: string;
}

/** Under a job nothing names the record; outside one, the word after the verb does. Returns how many positionals that took. */
export function agentSetupNamingOf(commandArguments: ArgumentParser, context: CommandContext, usage: string): { naming: AgentSetupNaming; consumed: number } {
  if (context.job !== undefined) return { naming: {}, consumed: VERB_WORD_COUNT };
  return { naming: { setupId: setupIdOf(commandArguments.positionalsBeforeSeparator()[VERB_WORD_COUNT], usage) }, consumed: VERB_WORD_COUNT + 1 };
}

async function payloadTextOf(commandArguments: ArgumentParser, context: CommandContext, consumed: number, usage: string): Promise<string> {
  const file = commandArguments.option('file');
  if (file === undefined) {
    if (commandArguments.positionalsBeforeSeparator().length > consumed) refuseUsage('Write the payload as JSON after --.', usage);
    const written = commandArguments.positionals().slice(consumed).join(' ').trim();
    if (written === '') refuseUsage('Write the payload as JSON after --, or name a file with --file.', usage);
    return written;
  }
  commandArguments.rejectExtraPositionals(consumed, usage);
  if (file === STANDARD_INPUT_MARKER) return suppliedTextOf(await context.readStandardInputBytes(), 'Standard input for --file -');
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(resolve(context.currentDirectory, file));
  } catch (problem) {
    throw new OperationRefusal('refused', `--file ${file} could not be read: ${problem instanceof Error ? problem.message : String(problem)}`);
  }
  return suppliedTextOf(bytes, `--file ${file}`);
}

/** The payload read through its schema; a misshapen one is refused as the applier would refuse it, naming the field. */
export async function agentPayloadOf<Value>(
  commandArguments: ArgumentParser,
  context: CommandContext,
  reading: { kind: PipelineAgentControlKind; consumed: number; usage: string; readingOf: (payload: unknown) => PayloadReading<Value> },
): Promise<{ payload: Record<string, unknown>; value: Value }> {
  const text = await payloadTextOf(commandArguments, context, reading.consumed, reading.usage);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return refuseUsage('The payload is not JSON.', reading.usage);
  }
  const read = reading.readingOf(payload);
  if (read.verdict === 'malformed') {
    const commandKind: ControlCommandKind = reading.kind;
    throw new OperationRefusal('refused', { kind: 'malformed-setup-command', commandKind, field: read.field });
  }
  return { payload: payload as Record<string, unknown>, value: read.value };
}
