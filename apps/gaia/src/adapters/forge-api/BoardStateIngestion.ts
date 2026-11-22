/**
 * The ingestion of a forge's board document (`GET /api/v4/board`) into Gaia's `ForgeBoard`. The document carries no version key: its version
 * is the `board` endpoint's, which Gaia derives from the forge's registry at the forge version it supports. Check the keys Gaia reads, then
 * map; a malformed document maps to nothing and names its keys, and a key Gaia does not read is passed over.
 */
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import { DocumentShapeUtil }           from '../../lib/json-value/DocumentShapeUtil.ts';
import type { ForgeBoard }             from '../../shared/@types/board/ForgeBoard.ts';
import type { DocumentReadingFailure } from './@types/ForgeDocumentReading.ts';
import type { ResumeWaitsOfJobs }      from './@types/ResumeWaitsOfJobs.ts';
import { BOARD_DOCUMENT_SHAPE }        from './constants/BoardDocumentShapes.ts';
import { BoardMapUtil }                from './utils/BoardMapUtil.ts';
import { PipelineMapUtil }             from './utils/PipelineMapUtil.ts';

export type BoardReading = { readonly board: ForgeBoard } | { readonly board: null; readonly reason: DocumentReadingFailure };

const NO_RESUME_WAITS: ResumeWaitsOfJobs = new Map();

export class BoardStateIngestion {
  /**
   * `trackerId` names the forge the document was read from, which the document itself does not name; `resumeWaits` is what its presence
   * says each waiting job follows, none when the board holds no waiting work and presence was not read.
   */
  public boardOf(trackerId: string, body: unknown, resumeWaits: ResumeWaitsOfJobs = NO_RESUME_WAITS): BoardReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, BOARD_DOCUMENT_SHAPE);
    if (invalidKeys.length > 0) return { board: null, reason: { invalidKeys } };
    const document = body as ForgeBoardDocument;
    return { board: BoardMapUtil.boardOf(trackerId, document, PipelineMapUtil.pipelineFactsOf(document), resumeWaits) };
  }
}
