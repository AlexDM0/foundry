/**
 * The ingestion of a forge's board document (`GET /api/v1/board`) into Gaia's `ForgeBoard`. The document carries no version key: its version
 * is the `board` endpoint's, which Gaia derives from the forge's registry at the forge version it supports. Check the keys Gaia reads, then
 * map; a malformed document maps to nothing and names its keys, and a key Gaia does not read is passed over.
 */
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import { DocumentShapeUtil }           from '../../lib/json-value/DocumentShapeUtil.ts';
import type { ForgeBoard }             from '../../shared/@types/board/ForgeBoard.ts';
import type { DocumentReadingFailure } from './@types/ForgeDocumentReading.ts';
import { BOARD_DOCUMENT_SHAPE }        from './constants/BoardDocumentShapes.ts';
import { BoardMapUtil }                from './utils/BoardMapUtil.ts';
import { PipelineMapUtil }             from './utils/PipelineMapUtil.ts';

export type BoardReading = { readonly board: ForgeBoard } | { readonly board: null; readonly reason: DocumentReadingFailure };

export class BoardStateIngestion {
  /** `trackerId` names the forge the document was read from, which the document itself does not name. */
  public boardOf(trackerId: string, body: unknown): BoardReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, BOARD_DOCUMENT_SHAPE);
    if (invalidKeys.length > 0) return { board: null, reason: { invalidKeys } };
    const document = body as ForgeBoardDocument;
    return { board: BoardMapUtil.boardOf(trackerId, document, PipelineMapUtil.pipelineFactsOf(document)) };
  }
}
