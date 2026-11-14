/**
 * `useQuestionsHabitat` under the Bridge's host of Flint. What matters: the view is the `questions` habitat; the facts it mounts with send
 * nothing; and a decision that waits with none selected reaches Flint as its cue.
 */
import { cleanup }                 from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import { useRef }                  from 'react';

import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../testing/FlintHabitatScene.ts';
import type { QuestionsFacts } from './QuestionsSpriteModel.ts';
import { useQuestionsHabitat } from './UseQuestionsHabitat.ts';

afterEach(cleanup);

function QuestionsList({ facts }: { readonly facts: QuestionsFacts }) {
  const viewElement = useRef<HTMLDivElement>(null);
  useQuestionsHabitat(viewElement, facts);
  return <div className="example-questions" ref={viewElement} data-flint-workplace="" />;
}

const NOTHING_OPEN: QuestionsFacts = {
  decisions: [], selectedDecisionId: null, incidents: [], history: [],
};

function sceneOfQuestions(): FlintHabitatScene<QuestionsFacts> {
  return flintHabitatSceneOf<QuestionsFacts>({
    storedHabitatKind: 'questions',
    viewOf:            (facts) => <QuestionsList facts={facts} />,
    firstProps:        NOTHING_OPEN,
    placeView:         () => placeAt(elementOf('.example-questions'), 100, 100, 800, 400),
  });
}

test('the view is the questions habitat, and the facts it mounts with send nothing', () => {
  const scene = sceneOfQuestions();
  expect(elementOf('.example-questions').getAttribute('data-sprite-habitat')).toBe('questions');
  expect(scene.cuesReceived(() => scene.show({ ...NOTHING_OPEN }))).toEqual([]);
});

test('a decision that waits with none selected reaches Flint as its cue', () => {
  const scene = sceneOfQuestions();
  const waiting = { ...NOTHING_OPEN, decisions: [{ id: 'D1', openedAt: '2026-11-10T09:00:00' }] };
  expect(scene.cuesReceived(() => scene.show(waiting))).toEqual(['decision-waits']);
});
