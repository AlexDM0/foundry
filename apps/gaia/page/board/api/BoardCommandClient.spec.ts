/**
 * The board's command client against answers in the page's contract, under the statuses Gaia's relay gives them. What matters: a
 * command is posted as JSON to the relay's commands route at its version, with the page's session cookie and no `Authorization` header;
 * each answer maps to its outcome, the forge's refusal sentence kept verbatim and Gaia's own sentence for a refusal of Gaia's; a 401 is
 * `no-session`; nothing answering is `unreachable`; and a 200 this page cannot read is `outcome-unknown`, never `unreachable`, since the
 * forge may have applied the command.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }                                     from '../../../src/shared/constants/GaiaSystemVersions.ts';
import type { BoardCommandDocument }                                  from '../../@types/board/BoardCommandDocument.ts';
import type { BoardCommandAnswerDocument, BoardForgeRefusalDocument } from '../../@types/board/BoardRelayDocuments.ts';
import { fakeRelayRequests, headersOf }                               from '../testing/FakeRelay.ts';
import { BoardCommandClient, type CommandOutcome }                    from './BoardCommandClient.ts';

const PAUSE_COMMAND: BoardCommandDocument = { boardCommandVersion: 2, kind: 'hephaestus-pause' };

const FORGE_REFUSAL: BoardForgeRefusalDocument = {
  refusedBy: 'forge', code: 'ticket-not-found', fields: { ticketId: 'T9' }, text: 'No ticket T9 on this board. Run `forge tickets` to list them.'
};

const GAIA_REFUSAL = { refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' } as const;

async function outcomeOf(answer: Response): Promise<CommandOutcome> {
  const relay = fakeRelayRequests();
  relay.answerWith(answer);
  return BoardCommandClient.create('example-tracker', relay.sendRequest).send(PAUSE_COMMAND);
}

function relayAnswerOf(status: number, content: Omit<BoardCommandAnswerDocument, 'boardCommandAnswerVersion'>): Response {
  return Response.json({ boardCommandAnswerVersion: 1, ...content } satisfies BoardCommandAnswerDocument, { status });
}

describe('the board\'s command client', () => {
  test('posts the command as JSON to the relay\'s commands route with the session cookie and no Authorization header', async () => {
    const relay = fakeRelayRequests();
    relay.answerWith(relayAnswerOf(200, { outcome: 'applied', applied: { outcome: 'done', startedJobId: null }, refusal: null }));
    await BoardCommandClient.create('example-tracker', relay.sendRequest).send(PAUSE_COMMAND);
    const [request] = relay.sent;
    expect(request?.path).toBe(`/api/v${GAIA_ENDPOINT_VERSIONS.forgeCommands}/forges/example-tracker/commands`);
    expect([request?.requestOptions.method, request?.requestOptions.credentials, request?.requestOptions.body]).toEqual(['POST', 'same-origin', JSON.stringify(PAUSE_COMMAND)]);
    expect([headersOf(request).get('content-type'), headersOf(request).has('authorization')]).toEqual(['application/json', false]);
  });

  test('an applied command answers its outcome and the job it started', async () => {
    expect(await outcomeOf(relayAnswerOf(200, { outcome: 'applied', applied: { outcome: 'done', startedJobId: 'J7' }, refusal: null })))
      .toEqual({ verdict: 'applied', outcome: 'done', result: { startedJobId: 'J7' } });
    expect(await outcomeOf(relayAnswerOf(200, { outcome: 'applied', applied: { outcome: 'nothing-to-do', startedJobId: null }, refusal: null })))
      .toEqual({ verdict: 'applied', outcome: 'nothing-to-do', result: { startedJobId: null } });
  });

  test('a forge refusal and an install hold keep the forge\'s sentence verbatim, even one that names a command', async () => {
    const refused = await outcomeOf(relayAnswerOf(409, { outcome: 'refused', applied: null, refusal: FORGE_REFUSAL }));
    const installHeld = await outcomeOf(relayAnswerOf(423, { outcome: 'install-held', applied: null, refusal: FORGE_REFUSAL }));
    expect([refused, installHeld]).toEqual([{ verdict: 'refused', refusal: FORGE_REFUSAL.text }, { verdict: 'install-held', refusal: FORGE_REFUSAL.text }]);
  });

  test('Gaia\'s answers keep their outcome: refused with Gaia\'s sentence, unreachable, and outcome-unknown once the command was sent', async () => {
    const unknownKind = { refusedBy: 'gaia', code: 'unknown-kind', text: 'Gaia does not know this kind of command.' } as const;
    expect(await outcomeOf(relayAnswerOf(400, { outcome: 'refused', applied: null, refusal: unknownKind })))
      .toEqual({ verdict: 'refused', refusal: 'Gaia does not know this kind of command.' });
    expect(await outcomeOf(relayAnswerOf(502, { outcome: 'unreachable', applied: null, refusal: GAIA_REFUSAL }))).toEqual({ verdict: 'unreachable' });
    expect(await outcomeOf(relayAnswerOf(502, { outcome: 'outcome-unknown', applied: null, refusal: GAIA_REFUSAL }))).toEqual({ verdict: 'outcome-unknown' });
  });

  test('a 401 is no-session, and nothing answering is unreachable', async () => {
    expect(await outcomeOf(new Response(null, { status: 401 }))).toEqual({ verdict: 'no-session' });
    const relay = fakeRelayRequests();
    expect(await BoardCommandClient.create('example-tracker', relay.sendRequest).send(PAUSE_COMMAND)).toEqual({ verdict: 'unreachable' });
  });

  test('a 200 whose body is lost, or of another answer version, is outcome-unknown, not unreachable', async () => {
    expect(await outcomeOf(new Response('{"outcome":"app', { status: 200 }))).toEqual({ verdict: 'outcome-unknown' });
    expect(await outcomeOf(Response.json({
      boardCommandAnswerVersion: 2, outcome: 'applied', applied: { outcome: 'done', startedJobId: null }, refusal: null
    }))).toEqual({ verdict: 'outcome-unknown' });
  });
});
