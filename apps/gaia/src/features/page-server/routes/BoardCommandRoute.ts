/**
 * `POST /api/v1/forges/<trackerId>/commands`: one board command per request, read to its bound through `BoardCommandIngestion`, sent as the
 * forge's command of the same kind (`BoardCommandMapUtil`) with `sendBoardCommand`, which keeps the forge's status, and answered as the
 * page's `BoardCommandAnswerDocument` under the status of how it ended. A body Gaia cannot read never reaches the forge.
 */
import { CommandAnswerIngestion }                         from '../../../adapters/forge-api/CommandAnswerIngestion.ts';
import { BoardCommandMapUtil }                            from '../../../adapters/forge-api/utils/BoardCommandMapUtil.ts';
import { BoardCommandIngestion }                          from '../../../adapters/page-api/BoardCommandIngestion.ts';
import type { JsonObject }                                from '../../../lib/json-value/JsonValueUtil.ts';
import { BoundedBody }                                    from '../../../lib/local-http-guards/BoundedBody.ts';
import type { BoardCommandRelayVerdict }                  from '../../../shared/@types/board/BoardRelayVerdict.ts';
import { BoardRelayAnswers }                              from '../BoardRelayAnswers.ts';
import { forgeAccessVerdictFor, type ForgeAccessSources } from '../ForgeAccess.ts';

async function boardCommandVerdictOf(request: Request, trackerId: string, sources: ForgeAccessSources, maximumBodyBytes: number): Promise<BoardCommandRelayVerdict> {
  const body = await BoundedBody.boundedTextOf(request, maximumBodyBytes);
  if (body.verdict === 'too-large') return { verdict: 'refused-by-gaia', outcome: 'refused', refusal: 'too-large' };
  const reading = new BoardCommandIngestion().commandOf(body.text);
  if (reading.verdict === 'refused') return { verdict: 'refused-by-gaia', outcome: 'refused', refusal: reading.refusal };
  const accessVerdict = await forgeAccessVerdictFor(trackerId, sources);
  if (accessVerdict.verdict === 'refused') {
    const refusal = BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal);
    return { verdict: 'refused-by-gaia', outcome: refusal === 'forge-unreachable' ? 'unreachable' : 'refused', refusal };
  }
  const contractCommand: JsonObject = BoardCommandMapUtil.contractCommandOf(reading.command);
  const answer = await sources.forgeClient.sendBoardCommand(accessVerdict.access, contractCommand);
  switch (answer.verdict) {
    case 'answered':
      return { verdict: 'answered', answer: new CommandAnswerIngestion().answerOf(answer.status, answer.body) };
    case 'unauthorized':
      return { verdict: 'refused-by-gaia', outcome: 'refused', refusal: 'token-rejected' };
    // Sent and not answered: the forge may have applied it, so the page is told the outcome is unknown, never that nothing happened.
    case 'unreachable':
      return { verdict: 'refused-by-gaia', outcome: 'outcome-unknown', refusal: 'forge-unreachable' };
    case 'refused':
    case 'malformed':
      return { verdict: 'refused-by-gaia', outcome: 'outcome-unknown', refusal: 'forge-document-unreadable' };
  }
}

export async function boardCommandAnswerFor(request: Request, trackerId: string, sources: ForgeAccessSources, maximumBodyBytes: number): Promise<Response> {
  return BoardRelayAnswers.commandAnswerOf(await boardCommandVerdictOf(request, trackerId, sources, maximumBodyBytes));
}
