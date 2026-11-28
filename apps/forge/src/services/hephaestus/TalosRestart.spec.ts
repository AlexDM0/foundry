/**
 * The clean restart of Talos as Hephaestus asks it. What matters: a connected Talos is sent the one quit frame with reason `restart`, and
 * the restart is `done` only when Talos took it; with no Talos, one already quitting, or one that did not answer, it is `nothing-to-do`
 * and nothing claims a restart that will not happen.
 */
import { describe, expect, test } from 'bun:test';

import type { DoneFrame }                          from '../../domain/talos/@types/TalosFrame.ts';
import type { TalosConnection, TalosFrameRequest } from './TalosConnection.ts';
import { quitTalosForRestart }                     from './TalosRestart.ts';

function connectionAnswering(answer: DoneFrame | 'no-answer'): { connection: TalosConnection; sentFrames: TalosFrameRequest[] } {
  const sentFrames: TalosFrameRequest[] = [];
  const connection: TalosConnection = {
    send: (frame) => {
      sentFrames.push(frame);
      return Promise.resolve(answer);
    },
    onState: () => undefined,
    onClose: () => undefined,
    close:   () => undefined,
  };
  return { connection, sentFrames };
}

describe('quitTalosForRestart', () => {
  test('a connected Talos is sent the quit frame with reason restart, and the restart is done once Talos took it', async () => {
    const { connection, sentFrames } = connectionAnswering({ kind: 'done', frameId: 1, verdict: 'done' });
    expect(await quitTalosForRestart(connection)).toBe('done');
    expect(sentFrames).toEqual([{ kind: 'quit', reason: 'restart' }]);
  });

  test('with no Talos connected nothing is sent and there is nothing to do', async () => {
    expect(await quitTalosForRestart(null)).toBe('nothing-to-do');
  });

  test('a Talos already quitting, or one that does not answer, is nothing to do', async () => {
    const quitting = connectionAnswering({
      kind: 'done', frameId: 1, verdict: 'refused', reason: 'quitting'
    });
    expect(await quitTalosForRestart(quitting.connection)).toBe('nothing-to-do');
    expect(await quitTalosForRestart(connectionAnswering('no-answer').connection)).toBe('nothing-to-do');
  });
});
