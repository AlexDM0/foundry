/**
 * `POST /api/commands`: one command per request, read through the command ingestion, carried by the command port `Main.ts` wires to
 * forge-control, and answered as the page contract's command answer under the status of its verdict. The page reads the answer whatever
 * the status.
 */
import { GaiaCommandIngestion }  from '../../../adapters/page-api/GaiaCommandIngestion.ts';
import { PageAnswerMapUtil }     from '../../../adapters/page-api/PageAnswerMapUtil.ts';
import { BoundedBody }           from '../../../lib/local-http-guards/BoundedBody.ts';
import type { CommandVerdict }   from '../../../shared/@types/CommandVerdict.ts';
import type { GaiaCommand }      from '../../../shared/@types/GaiaCommand.ts';
import type { PageServerAnswer } from '../@types/PageServerAnswer.ts';
import { HTTP_STATUS_OF_ANSWER } from '../HttpStatusOfAnswer.ts';
import { refusalAnswerOf }       from '../RefusalAnswer.ts';

/** Carries one command and answers how it ended; never throws for a forge that is down. */
export type CommandCarrier = (command: GaiaCommand) => Promise<CommandVerdict>;

const ANSWER_OF_VERDICT: Readonly<Record<CommandVerdict['verdict'], PageServerAnswer>> = {
  'done':                   'answered',
  'outage-resume-answered': 'answered',
  'path-chosen':            'answered',
  'nothing-to-do':          'answered',
  'restart-pending':        'answered',
  'refused':                'refused-by-forge',
  'unreachable':            'forge-unreachable',
  'not-supported':          'command-not-supported',
};

export async function commandAnswerFor(request: Request, carryCommand: CommandCarrier, maximumBodyBytes: number): Promise<Response> {
  const body = await BoundedBody.boundedTextOf(request, maximumBodyBytes);
  if (body.verdict === 'too-large') return refusalAnswerOf('body-too-large');
  const reading = new GaiaCommandIngestion(body.text).read();
  if (reading.verdict !== 'readable') return Response.json(PageAnswerMapUtil.unreadableCommandAnswerOf(reading), { status: HTTP_STATUS_OF_ANSWER['body-not-understood'] });
  const verdict = await carryCommand(reading.command);
  return Response.json(PageAnswerMapUtil.commandAnswerOf(verdict), { status: HTTP_STATUS_OF_ANSWER[ANSWER_OF_VERDICT[verdict.verdict]] });
}
