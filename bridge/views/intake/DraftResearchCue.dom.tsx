/**
 * `DraftResearchCue` inside a chat card under the Bridge's host of Flint. What matters: the drafts it mounts with send nothing, and a draft
 * that becomes researching reaches the thread's chat habitat as its cue, through the card's relay.
 */
import { cleanup }                 from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { ChatCard, ChatThread } from '../../conversation/ChatThread.tsx';
import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../../testing/FlintHabitatScene.ts';
import { DraftResearchCue } from './DraftResearchCue.tsx';
import type { CuedDraft }   from './IntakeSpriteModel.ts';

afterEach(cleanup);

function sceneOfIntakeChat(): FlintHabitatScene<readonly CuedDraft[]> {
  return flintHabitatSceneOf<readonly CuedDraft[]>({
    storedHabitatKind: 'chat',
    viewOf:            (drafts) => (
      <ChatCard label="Intake chat">
        <ChatThread label="Intake conversation" turns={[]} renderDecision={() => null} />
        <DraftResearchCue drafts={drafts} />
      </ChatCard>
    ),
    firstProps: [{ id: 'D1', state: 'waiting' }],
    placeView:  () => placeAt(elementOf('ol.bridge-chat-thread'), 200, 100, 600, 400),
  });
}

test('the drafts it mounts with send nothing', () => {
  const scene = sceneOfIntakeChat();
  expect(scene.cuesReceived(() => scene.show([{ id: 'D1', state: 'waiting' }]))).toEqual([]);
});

test('a draft that becomes researching reaches the chat habitat as its cue', () => {
  const scene = sceneOfIntakeChat();
  expect(scene.cuesReceived(() => scene.show([{ id: 'D1', state: 'researching' }]))).toEqual(['draft-is-researching']);
});
