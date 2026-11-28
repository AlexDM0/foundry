/** What the recorded review passes catch, miss and cost, read from the tracker as `status` reads it: no lock, nothing written or rendered. */
import { readingBoardOf }                             from '../../../src/domain/tracker-model/ReadingBoard.ts';
import { PRODUCT_NAMES }                              from '../../../src/shared/constants/ProductNames.ts';
import { boardReadsOf }                               from '../../BoardStoreOf.ts';
import type { CommandHandler }                        from '../../CommandHandler.ts';
import { OutputUtil }                                 from '../../utils/OutputUtil.ts';
import { noRecordedReviewsTextOf, reviewStatsTextOf } from './ReviewStatsText.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} review-stats [--json]`;

const KNOWN_OPTION_NAMES = ['json'];

export const reviewStatsCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const {
    progress, storedLog, listing, epicListing, draftListing
  } = boardReadsOf(context).requireBoard();
  OutputUtil.reportIgnoredTicketFiles(context, listing.unreadable);

  const report    = readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts).reviewStatisticsOf(storedLog.records);
  const humanText = report.recordedTicketCount === 0 ? noRecordedReviewsTextOf(report) : reviewStatsTextOf(report);
  OutputUtil.printEntity(commandArguments, context, report, humanText);
  return Promise.resolve();
};
