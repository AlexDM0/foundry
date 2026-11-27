import { LogUtil }               from '../../src/adapters/utils/LogUtil.ts';
import type { LogRecord }        from '../../src/domain/tracker-model/@types/LogRecord.ts';
import type { UnreadableRecord } from '../../src/services/tracker/@types/BoardRecords.ts';
import { JsonTextUtil }          from '../../src/shared/utils/JsonTextUtil.ts';
import type { CommandContext }   from '../CommandContext.ts';
import type { ArgumentParser }   from '../arguments/ArgumentParser.ts';

export const SHORT_COMMIT_LENGTH_CHARACTERS = 8;

function padColumn(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}

function ignoredTicketFileText(unreadable: UnreadableRecord): string {
  const place = unreadable.line > 0 ? ` (line ${unreadable.line})` : '';
  return `Ticket file ignored: ${unreadable.location}${place}: ${unreadable.reason}`;
}

function reportIgnoredTicketFiles(context: CommandContext, unreadableTickets: readonly UnreadableRecord[]): void {
  for (const unreadable of unreadableTickets) context.standardError(ignoredTicketFileText(unreadable));
}

function reportIgnoredEpicFiles(context: CommandContext, unreadableEpics: readonly UnreadableRecord[]): void {
  for (const unreadable of unreadableEpics) {
    const place = unreadable.line > 0 ? ` (line ${unreadable.line})` : '';
    context.standardError(`Epic file ignored: ${unreadable.location}${place}: ${unreadable.reason}`);
  }
}

function reportIgnoredDraftFiles(context: CommandContext, unreadableDrafts: readonly UnreadableRecord[]): void {
  for (const unreadable of unreadableDrafts) context.standardError(`Draft file ignored: ${unreadable.location}: ${unreadable.reason}`);
}

/** The ticket's spec and plan are left out of every reading, and the ticket is held and never ready until the record reads again. */
function reportIgnoredTicketDocumentRecords(context: CommandContext, unreadableRecords: readonly UnreadableRecord[]): void {
  for (const unreadable of unreadableRecords) {
    context.standardError(`Ticket documents ignored: ${unreadable.location}: ${unreadable.reason}. Ticket #${unreadable.key ?? ''} is held until they read again.`);
  }
}

function loggedSentencesOf(logged: readonly LogRecord[]): string {
  return logged.map((record) => LogUtil.sentenceOf(record)).join('\n');
}

function printEntity(commandArguments: ArgumentParser, context: CommandContext, entity: unknown, humanLine: string): void {
  if (commandArguments.flag('json')) {
    context.standardOutput(JsonTextUtil.indentedTextOf(entity));
    return;
  }
  context.standardOutput(humanLine);
}

/** The human line and the Next line under it, or the entity alone under `--json`, which a script parses and must never find a trailing sentence in. */
function printEntityThenNextLine(commandArguments: ArgumentParser, context: CommandContext, entity: unknown, humanLine: string, nextLine: string): void {
  printEntity(commandArguments, context, entity, `${humanLine}\n${nextLine}`);
}

/** A commit printed in a sentence, cut to its first characters as git abbreviates; a text already that short is kept whole. */
function shortCommitOf(commit: string): string {
  return commit.slice(0, SHORT_COMMIT_LENGTH_CHARACTERS);
}

export const OutputUtil = {
  padColumn,
  shortCommitOf,
  loggedSentencesOf,
  printEntity,
  printEntityThenNextLine,
  ignoredTicketFileText,
  reportIgnoredTicketFiles,
  reportIgnoredEpicFiles,
  reportIgnoredDraftFiles,
  reportIgnoredTicketDocumentRecords,
} as const;
