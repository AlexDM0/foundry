/**
 * `GET /api/v1/forges/<trackerId>/board`: the forge's board document read afresh, ingested into Gaia's model and mapped to the page's
 * `BoardDocument`. Reads of one forge are shared: a request that comes while a read is on its way waits for the next one, which starts once
 * that read is done and answers every request that waited, so a burst of change signals costs at most two reads and one map each.
 */
import { BoardStateIngestion }                            from '../../../adapters/forge-api/BoardStateIngestion.ts';
import { BoardDocumentMapUtil }                           from '../../../adapters/page-api/BoardDocumentMapUtil.ts';
import type { BoardRelayRefusal }                         from '../../../shared/@types/board/BoardRelayVerdict.ts';
import type { BoardRelayLog }                             from '../@types/BoardRelayLogEntry.ts';
import { BoardRelayAnswers }                              from '../BoardRelayAnswers.ts';
import { forgeAccessVerdictFor, type ForgeAccessSources } from '../ForgeAccess.ts';

export interface BoardStateRoute {
  readonly answerFor: (trackerId: string) => Promise<Response>;
}

type BoardRead = { readonly verdict: 'read'; readonly boardDocumentJson: string } | { readonly verdict: 'refused'; readonly refusal: BoardRelayRefusal };

interface ForgeBoardReads {
  readonly inFlight: Promise<BoardRead>;
  pendingRead:       Promise<BoardRead> | null;
}

const JSON_CONTENT_TYPE = 'application/json;charset=utf-8';

export function createBoardStateRoute(sources: ForgeAccessSources, log: BoardRelayLog): BoardStateRoute {
  const readsByTrackerId = new Map<string, ForgeBoardReads>();
  const ingestion = new BoardStateIngestion();

  async function boardReadAfresh(trackerId: string): Promise<BoardRead> {
    const accessVerdict = await forgeAccessVerdictFor(trackerId, sources);
    if (accessVerdict.verdict === 'refused') return { verdict: 'refused', refusal: BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal) };
    const answer = await sources.forgeClient.boardOf(accessVerdict.access);
    switch (answer.verdict) {
      case 'unreachable':
        return { verdict: 'refused', refusal: 'forge-unreachable' };
      case 'unauthorized':
        return { verdict: 'refused', refusal: 'token-rejected' };
      case 'refused':
      case 'malformed':
        return { verdict: 'refused', refusal: 'forge-document-unreadable' };
      case 'answered':
        break;
    }
    const reading = ingestion.boardOf(trackerId, answer.document);
    if (reading.board === null) {
      log({ kind: 'board-unreadable', trackerId, invalidKeys: reading.reason.invalidKeys });
      return { verdict: 'refused', refusal: 'forge-document-unreadable' };
    }
    return { verdict: 'read', boardDocumentJson: JSON.stringify(BoardDocumentMapUtil.boardDocumentOf(reading.board)) };
  }

  function beginRead(trackerId: string): Promise<BoardRead> {
    const reads: ForgeBoardReads = { inFlight: boardReadAfresh(trackerId), pendingRead: null };
    readsByTrackerId.set(trackerId, reads);
    const forgetOnceDone = (): void => {
      if (readsByTrackerId.get(trackerId) === reads && reads.pendingRead === null) readsByTrackerId.delete(trackerId);
    };
    reads.inFlight.then(forgetOnceDone, forgetOnceDone);
    return reads.inFlight;
  }

  /** A read already on its way may have started before the change this request follows, so the request waits for the next read. */
  function sharedReadOf(trackerId: string): Promise<BoardRead> {
    const reads = readsByTrackerId.get(trackerId);
    if (reads === undefined) return beginRead(trackerId);
    if (reads.pendingRead === null) {
      const readAfterThis = (): Promise<BoardRead> => beginRead(trackerId);
      reads.pendingRead = reads.inFlight.then(readAfterThis, readAfterThis);
    }
    return reads.pendingRead;
  }

  async function answerFor(trackerId: string): Promise<Response> {
    const read = await sharedReadOf(trackerId);
    if (read.verdict === 'refused') return BoardRelayAnswers.relayRefusalAnswerOf(read.refusal);
    return new Response(read.boardDocumentJson, { headers: { 'content-type': JSON_CONTENT_TYPE, ...BoardRelayAnswers.NO_STORE } });
  }

  return { answerFor };
}
