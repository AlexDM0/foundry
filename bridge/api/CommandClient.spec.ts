/**
 * The command client against the recorded Overseer API. What matters: a command rides the session token as a bearer header (the token's
 * fetch, rotation and refusals are `SessionTokenSource.spec.ts`'s); 200, 409, 423 and an unreachable Overseer each map to their verdict,
 * the refusal kept verbatim; a session token answered 401 is `no-session`; and a command client and a picture client given one token source
 * fetch the token once between them.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { recordedOverseerAnswerOf, useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type OverseerCallShape, type RecordedHttpResponse }              from '../../src/testing/RecordedOverseerFetch.ts';
import { CommandClient }                                                                        from './CommandClient.ts';
import { PictureUploadClient }                                                                  from './PictureUploadClient.ts';
import { SessionTokenSource }                                                                   from './SessionTokenSource.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

function recordedRefusalOf(callShape: OverseerCallShape): string {
  return ((recordedOverseerAnswerOf(callShape) as RecordedHttpResponse).body as { refusal: string }).refusal;
}

describe('the command client', () => {
  test('sends the command as JSON with the session token, and an applied one answers its outcome and result', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const client = CommandClient.create(overseer.fetch);
    const applied = recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.COMMAND_APPLIED) as RecordedHttpResponse;
    const { outcome } = applied.body as { outcome: unknown };
    expect(await client.send({ kind: 'overseer-pause' })).toMatchObject({ verdict: 'applied', outcome, result: { previousState: 'paused' } });
    const [, commandRequest] = overseer.requests;
    expect(commandRequest?.authorization).toBe('Bearer token-1');
    expect(commandRequest?.init?.body).toBe(JSON.stringify({ kind: 'overseer-pause' }));
  });

  test('a 409 is refused with the Overseer\'s sentence verbatim, a 423 is install-held, and an Overseer gone is unreachable', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true });
    const client = CommandClient.create(overseer.fetch);
    overseer.answerCommandsWith('refused');
    expect(await client.send({ kind: 'ticket-ready' })).toEqual({ verdict: 'refused', refusal: recordedRefusalOf(OVERSEER_CALL_SHAPES.COMMAND_REFUSED) });
    overseer.answerCommandsWith('install-held');
    expect(await client.send({ kind: 'ticket-ready' })).toEqual({ verdict: 'install-held', refusal: recordedRefusalOf(OVERSEER_CALL_SHAPES.COMMAND_INSTALL_HELD) });
    overseer.stop();
    expect(await CommandClient.create(overseer.fetch).send({ kind: 'overseer-pause' })).toEqual({ verdict: 'unreachable' });
  });

  test('A4: a session token answered 401 leaves the command unsent as no-session', async () => {
    const overseer = recordedOverseer();
    expect(await CommandClient.create(overseer.fetch).send({ kind: 'overseer-pause' })).toEqual({ verdict: 'no-session' });
  });

  test('a command client and a picture client given one token source fetch the token once between them', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const tokenSource = SessionTokenSource.create(overseer.fetch);
    await CommandClient.create(overseer.fetch, tokenSource).send({ kind: 'overseer-pause' });
    await PictureUploadClient.create(overseer.fetch, tokenSource).upload(new Blob([new Uint8Array([0x89])], { type: 'image/png' }));
    expect(overseer.requests.map((request) => request.path)).toEqual(['/api/session-token', '/api/commands', '/api/pictures']);
  });
});
