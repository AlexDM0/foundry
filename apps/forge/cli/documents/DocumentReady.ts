/** `document ready`: the agent tells Hephaestus that the head version of its document is complete and waits for review. */
import type { CommandContext }  from '../CommandContext.ts';
import type { ArgumentParser }  from '../arguments/ArgumentParser.ts';
import { relayDocumentCommand } from './DocumentRelay.ts';
import { DOCUMENT_USAGE }       from './constants/DocumentUsage.ts';

export async function markDocumentReady(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['json'], DOCUMENT_USAGE.ready);
  commandArguments.rejectExtraPositionals(1, DOCUMENT_USAGE.ready);
  await relayDocumentCommand(context, { kind: 'ticket-document-agent-ready' }, DOCUMENT_USAGE.ready);
}
