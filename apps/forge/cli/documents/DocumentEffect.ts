/** `document effect <version>`: the agent asks what a version of its document names in the main line's tree; the answer comes as a message. */
import type { CommandContext }  from '../CommandContext.ts';
import { refuseUsage }          from '../RecordedIncidentMove.ts';
import type { ArgumentParser }  from '../arguments/ArgumentParser.ts';
import { relayDocumentCommand } from './DocumentRelay.ts';
import { DOCUMENT_USAGE }       from './constants/DocumentUsage.ts';

const VERSION_PATTERN = /^[1-9][0-9]*$/;

export async function readDocumentEffect(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = DOCUMENT_USAGE.effect;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const written = commandArguments.positionals()[1];
  if (written === undefined || !VERSION_PATTERN.test(written)) refuseUsage('Name the version of the document, as 3.', usage);
  await relayDocumentCommand(context, { kind: 'ticket-document-agent-effect-read', version: Number(written) }, usage);
}
