/**
 * `POST /api/commands`: one command per request, read through the command ingestion, carried by the command port `Main.ts` wires to
 * forge-control, and answered as the page contract's command answer under the status of its verdict. The page reads the answer whatever
 * the status.
 */
import { CommandAnswerMapUtil } from '../../../adapters/page-api/CommandAnswerMapUtil.ts';
import { GaiaCommandIngestion } from '../../../adapters/page-api/GaiaCommandIngestion.ts';
import type { CommandVerdict }  from '../../../shared/@types/CommandVerdict.ts';
import type { GaiaCommand }     from '../../../shared/@types/GaiaCommand.ts';

export const COMMANDS_PATH = '/api/commands';

/** Carries one command and answers how it ended; never throws for a forge that is down. */
export type CommandCarrier = (command: GaiaCommand) => Promise<CommandVerdict>;

const HTTP_STATUS_OF_VERDICT: Readonly<Record<CommandVerdict['verdict'], number>> = {
  'done':          200,
  'nothing-to-do': 200,
  'refused':       409,
  'unreachable':   502,
  'not-supported': 501,
};

const HTTP_BAD_REQUEST = 400;

export async function commandAnswerFor(request: Request, carryCommand: CommandCarrier): Promise<Response> {
  const reading = new GaiaCommandIngestion(await request.text()).read();
  if (reading.verdict !== 'readable') return Response.json(CommandAnswerMapUtil.unreadableCommandAnswerOf(reading), { status: HTTP_BAD_REQUEST });
  const verdict = await carryCommand(reading.command);
  return Response.json(CommandAnswerMapUtil.commandAnswerOf(verdict), { status: HTTP_STATUS_OF_VERDICT[verdict.verdict] });
}
