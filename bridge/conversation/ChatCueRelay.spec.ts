/**
 * The relay between a chat card's composer and its thread. What matters: a cue reaches the connected sender; with none connected it goes
 * nowhere; a sender that disconnects after another connected leaves the newer one in place.
 */
import { expect, test } from 'bun:test';

import { createChatCueRelay } from './ChatCueRelay.ts';

test('a cue reaches the connected sender, and goes nowhere once it disconnects', () => {
  const relay = createChatCueRelay();
  const cues: string[] = [];
  relay.cue('user-is-typing');
  const disconnect = relay.connect((cueName) => cues.push(cueName));
  relay.cue('user-is-typing');
  disconnect();
  relay.cue('user-is-typing');
  expect(cues).toEqual(['user-is-typing']);
});

test('an older sender that disconnects leaves the newer one connected', () => {
  const relay = createChatCueRelay();
  const cues: string[] = [];
  const disconnectOlder = relay.connect(() => cues.push('older'));
  relay.connect(() => cues.push('newer'));
  disconnectOlder();
  relay.cue('user-is-typing');
  expect(cues).toEqual(['newer']);
});
