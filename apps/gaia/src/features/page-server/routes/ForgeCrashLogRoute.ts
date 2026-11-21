/**
 * `GET /api/v1/forges/<trackerId>/crash-logs/<number>`: one crash log of a forge that serves again, read through its API when User opens it,
 * ingested and mapped to the page's `CrashLogDocument`. A log is written once and never changes, so each is read once per start of the forge's
 * Overseer and kept for the next ask; a forge that does not answer, the one off after a crash included, is refused.
 */
import { CrashLogIngestion }                                                   from '../../../adapters/forge-api/CrashLogIngestion.ts';
import { CrashLogDocumentMapUtil }                                             from '../../../adapters/page-api/CrashLogDocumentMapUtil.ts';
import type { BoardRelayRefusal }                                              from '../../../shared/@types/board/BoardRelayVerdict.ts';
import type { BoardRelayLog }                                                  from '../@types/BoardRelayLogEntry.ts';
import { BoardRelayAnswers }                                                   from '../BoardRelayAnswers.ts';
import { accessVerdictOf, watchedOverseerVerdictFor, type ForgeAccessSources } from '../ForgeAccess.ts';

export interface ForgeCrashLogRoute {
  readonly answerFor: (trackerId: string, writtenNumber: string) => Promise<Response>;
}

type CrashLogRead = { readonly verdict: 'read'; readonly crashLogDocumentJson: string } | { readonly verdict: 'refused'; readonly refusal: BoardRelayRefusal };

const JSON_CONTENT_TYPE = 'application/json;charset=utf-8';

const CRASH_LOG_NUMBER = /^[1-9]\d*$/;

function crashLogNumberOf(writtenNumber: string): number | null {
  return CRASH_LOG_NUMBER.test(writtenNumber) && Number.isSafeInteger(Number(writtenNumber)) ? Number(writtenNumber) : null;
}

export function createForgeCrashLogRoute(sources: ForgeAccessSources, log: BoardRelayLog): ForgeCrashLogRoute {
  const ingestion = new CrashLogIngestion();
  const readsByKey = new Map<string, Promise<CrashLogRead>>();

  async function crashLogReadOf(trackerId: string, crashLogNumber: number): Promise<CrashLogRead> {
    const watched = await watchedOverseerVerdictFor(trackerId, sources);
    if (watched.verdict === 'refused') return { verdict: 'refused', refusal: BoardRelayAnswers.relayRefusalOfAccess(watched.refusal) };
    const key = `${trackerId} ${watched.overseer.url} ${watched.overseer.startedAt} ${crashLogNumber}`;
    const keptRead = readsByKey.get(key);
    if (keptRead !== undefined) return keptRead;
    const read = crashLogReadAfresh(trackerId, crashLogNumber, watched.overseer, watched.forgeSystemVersion);
    readsByKey.set(key, read);
    // Only a log that was read is kept: a refusal may be gone by the next ask.
    void read.then((outcome) => {
      if (outcome.verdict === 'refused') readsByKey.delete(key);
    });
    return read;
  }

  async function crashLogReadAfresh(
    trackerId: string,
    crashLogNumber: number,
    ...accessParts: Parameters<typeof accessVerdictOf>
  ): Promise<CrashLogRead> {
    const accessVerdict = await accessVerdictOf(...accessParts);
    if (accessVerdict.verdict === 'refused') return { verdict: 'refused', refusal: BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal) };
    const answer = await sources.forgeClient.crashLogOf(accessVerdict.access, crashLogNumber);
    switch (answer.verdict) {
      case 'unreachable':
        return { verdict: 'refused', refusal: 'forge-unreachable' };
      case 'unauthorized':
        return { verdict: 'refused', refusal: 'token-rejected' };
      case 'refused':
        return { verdict: 'refused', refusal: answer.refusal === 'no-crash-log' ? 'not-found' : 'forge-document-unreadable' };
      case 'malformed':
        return { verdict: 'refused', refusal: 'forge-document-unreadable' };
      case 'answered':
        break;
    }
    const reading = ingestion.crashLogOf(answer.document);
    if (reading.crashLog === null) {
      log({ kind: 'crash-log-unreadable', trackerId, invalidKeys: reading.reason.invalidKeys });
      return { verdict: 'refused', refusal: 'forge-document-unreadable' };
    }
    return { verdict: 'read', crashLogDocumentJson: JSON.stringify(CrashLogDocumentMapUtil.crashLogDocumentOf(reading.crashLog)) };
  }

  async function answerFor(trackerId: string, writtenNumber: string): Promise<Response> {
    const crashLogNumber = crashLogNumberOf(writtenNumber);
    if (crashLogNumber === null) return BoardRelayAnswers.relayRefusalAnswerOf('not-found');
    const read = await crashLogReadOf(trackerId, crashLogNumber);
    if (read.verdict === 'refused') return BoardRelayAnswers.relayRefusalAnswerOf(read.refusal);
    return new Response(read.crashLogDocumentJson, { headers: { 'content-type': JSON_CONTENT_TYPE, ...BoardRelayAnswers.NO_STORE } });
  }

  return { answerFor };
}
