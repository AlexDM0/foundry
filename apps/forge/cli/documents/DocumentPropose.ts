/**
 * `document propose`: the agent sends its edit of its document as JSON, `{baseVersion, edits, summary, answers?}`, after `--` or on standard
 * input. Each edit replaces lines `fromLine` to `toLine` of the version `baseVersion` and names the lines it replaces; Hephaestus checks the
 * fields.
 */
import type { LineEdit }        from '../../src/domain/tracker-model/@types/TicketDocument.ts';
import type { CommandContext }  from '../CommandContext.ts';
import { refuseUsage }          from '../RecordedIncidentMove.ts';
import { suppliedTextOf }       from '../SuppliedText.ts';
import type { ArgumentParser }  from '../arguments/ArgumentParser.ts';
import { relayDocumentCommand } from './DocumentRelay.ts';
import { DOCUMENT_USAGE }       from './constants/DocumentUsage.ts';

function proposalOf(text: string, usage: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuseUsage('The proposal is not JSON.', usage);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) refuseUsage('Write the proposal as one JSON object.', usage);
  return parsed as Record<string, unknown>;
}

export async function proposeDocumentEdit(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = DOCUMENT_USAGE.propose;
  commandArguments.rejectUnknownOptions(['json'], usage);
  if (commandArguments.positionalsBeforeSeparator().length > 1) refuseUsage('Write the proposal as JSON after --, or pipe it in.', usage);
  const written = commandArguments.positionals().slice(1).join(' ').trim();
  if (written === '' && context.standardInputIsTerminal) refuseUsage('Write the proposal as JSON after --, or pipe it in.', usage);
  const proposal = proposalOf(written === '' ? suppliedTextOf(await context.readStandardInputBytes(), 'Standard input') : written, usage);
  await relayDocumentCommand(context, {
    kind:        'ticket-document-agent-propose',
    baseVersion: proposal['baseVersion'] as number | null,
    edits:       proposal['edits'] as LineEdit[],
    summary:     proposal['summary'] as string,
    ...(proposal['answers'] === undefined ? {} : { answers: proposal['answers'] as string }),
  }, usage);
}
