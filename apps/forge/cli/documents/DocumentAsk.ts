/**
 * `document ask`: the agent asks User a question as JSON, `{version, lines, question, options}`, after `--` or on standard input. The lines
 * are those of the version that the question changes, and each option is `{label, description?, touches?, tradeOff?, acceptanceEffect?,
 * recommended?}`; Hephaestus checks the fields.
 */
import type { LineRange }                        from '../../src/lib/tracker-model/@types/TicketDocument.ts';
import type { DocumentQuestionOptionSubmission } from '../../src/shared/@types/ControlCommand.ts';
import type { CommandContext }                   from '../CommandContext.ts';
import { refuseUsage }                           from '../RecordedIncidentMove.ts';
import { suppliedTextOf }                        from '../SuppliedText.ts';
import type { ArgumentParser }                   from '../arguments/ArgumentParser.ts';
import { relayDocumentCommand }                  from './DocumentRelay.ts';
import { DOCUMENT_USAGE }                        from './constants/DocumentUsage.ts';

function questionOf(text: string, usage: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuseUsage('The question is not JSON.', usage);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) refuseUsage('Write the question as one JSON object.', usage);
  return parsed as Record<string, unknown>;
}

export async function askDocumentQuestion(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = DOCUMENT_USAGE.ask;
  commandArguments.rejectUnknownOptions(['json'], usage);
  if (commandArguments.positionalsBeforeSeparator().length > 1) refuseUsage('Write the question as JSON after --, or pipe it in.', usage);
  const written = commandArguments.positionals().slice(1).join(' ').trim();
  if (written === '' && context.standardInputIsTerminal) refuseUsage('Write the question as JSON after --, or pipe it in.', usage);
  const question = questionOf(written === '' ? suppliedTextOf(await context.readStandardInputBytes(), 'Standard input') : written, usage);
  await relayDocumentCommand(context, {
    kind:     'ticket-document-agent-ask',
    version:  question['version'] as number,
    lines:    question['lines'] as LineRange,
    question: question['question'] as string,
    options:  question['options'] as DocumentQuestionOptionSubmission[],
  }, usage);
}
