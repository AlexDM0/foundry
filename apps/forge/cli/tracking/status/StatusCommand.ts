import { HoldJournalProblemWording }                    from '../../../src/adapters/hold-journal/HoldJournalProblemWording.ts';
import { LogUtil }                                      from '../../../src/adapters/utils/LogUtil.ts';
import { readingBoardOf }                               from '../../../src/domain/tracker-model/ReadingBoard.ts';
import { LocalTimeUtil }                                from '../../../src/lib/local-time/LocalTimeUtil.ts';
import type { WordedLogEntry }                          from '../../../src/shared/@types/WordedLogEntry.ts';
import { PRODUCT_NAMES }                                from '../../../src/shared/constants/ProductNames.ts';
import { boardStoreOf }                                 from '../../BoardStoreOf.ts';
import type { CommandHandler }                          from '../../CommandHandler.ts';
import { fullDocumentOf, workingDocumentOf }            from '../../StatusDocuments.ts';
import { NextLineUtil }                                 from '../../utils/NextLineUtil.ts';
import { OutputUtil }                                   from '../../utils/OutputUtil.ts';
import { confinementInForceOf, readConfinementInForce } from './ConfinementInForceReading.ts';
import { hephaestusStatusTextOf, readHephaestusStatus } from './HephaestusStatusReading.ts';
import { humanStatusTextOf }                            from './StatusText.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} status [--json] [--full] [--tickets-only]`;

const KNOWN_OPTION_NAMES = ['json', 'full', 'tickets-only'];

/**
 * Sorted for display because `--at` backfills, so array order is not chronological: a stated exception
 * to "a clock decides nothing" that decides nothing but a print order, on a copy of the caller's array.
 */
function logNewestFirstOf(log: readonly WordedLogEntry[]): WordedLogEntry[] {
  const dated = log.map((entry, appendedIndex) => ({
    entry,
    appendedIndex,
    epochMilliseconds: LocalTimeUtil.parseIso(entry.at)?.getTime() ?? Number.NEGATIVE_INFINITY,
  }));
  dated.sort((a, b) => b.epochMilliseconds - a.epochMilliseconds || b.appendedIndex - a.appendedIndex);
  return dated.map((datedEntry) => datedEntry.entry);
}

export const statusCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const { workspace, store } = boardStoreOf(context);
  const unfinishedWrite = store.reads.readUnfinishedWrite();
  if (unfinishedWrite.verdict === 'malformed') {
    context.standardError(`Hold journal unreadable: ${unfinishedWrite.location}: ${HoldJournalProblemWording.sentenceOf(unfinishedWrite.problem)}. `
      + 'Every write refuses until it is repaired or removed.');
  }
  const {
    progress, pipelineReading, storedLog, listing, epicListing, draftListing, ticketDocumentListing
  } = store.reads.requireBoard();
  const wordedLog       = storedLog.records.map(LogUtil.wordedEntryOf);
  const logNewestFirst  = logNewestFirstOf(wordedLog);
  const board           = readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts, storedLog.records);

  OutputUtil.reportIgnoredTicketFiles(context, listing.unreadable);
  OutputUtil.reportIgnoredEpicFiles(context, epicListing.unreadable);
  OutputUtil.reportIgnoredDraftFiles(context, draftListing.unreadable);
  OutputUtil.reportIgnoredTicketDocumentRecords(context, ticketDocumentListing.unreadable);

  const showsEverything  = commandArguments.flag('full');
  const showsTicketsOnly = commandArguments.flag('tickets-only');
  const confinementInForce = commandArguments.flag('json')
    ? await readConfinementInForce(context, workspace)
    : confinementInForceOf(null, context.platformPorts.gateConfinement);
  const boardDocument    = showsEverything
    ? fullDocumentOf(progress, wordedLog, board, showsTicketsOnly, confinementInForce, pipelineReading.verdict === 'readable')
    : workingDocumentOf(progress, logNewestFirst, board, showsTicketsOnly, confinementInForce, pipelineReading.verdict === 'readable');
  const hephaestusStatus = await readHephaestusStatus(context, workspace, progress);
  const humanText        = [
    hephaestusStatusTextOf(hephaestusStatus),
    '',
    humanStatusTextOf(progress, logNewestFirst, board, { showsEverything, showsTicketsOnly }),
  ].join('\n');
  OutputUtil.printEntityThenNextLine(commandArguments, context, { ...boardDocument, hephaestus: hephaestusStatus.facts }, humanText, NextLineUtil.nextLineOf(board));
};
