/**
 * The Board over a board's stored contents, opened on every reading the store holds, so a Board that only reads answers what a write's
 * Board would: the open setup's Apply refusal among them.
 */
import { Board }                     from '../../lib/tracker-model/Board.ts';
import { createLogger, type Logger } from '../../lib/tracker-model/Logger.ts';
import type { BoardContents }        from './@types/BoardRecords.ts';

export function boardOfContents(contents: BoardContents, logger: Logger): Board {
  return new Board({
    progress:            contents.progress,
    tickets:             contents.listing.tickets,
    epics:               contents.epicListing.epics,
    drafts:              contents.draftListing.drafts,
    logger,
    storedLogRecords:    contents.storedLog.records,
    pipeline:            contents.pipelineReading.verdict === 'readable' ? contents.pipelineReading.pipeline : null,
    pipelineSetup:       contents.pipelineSetupReading,
    gateProfiles:        contents.gateProfilesReading,
    constitutionSources: contents.constitutionSourcesReading,
  });
}

/** What it would log goes nowhere, and nothing it holds is written. */
export function readingBoardOfContents(contents: BoardContents): Board {
  return boardOfContents(contents, createLogger(() => undefined));
}
