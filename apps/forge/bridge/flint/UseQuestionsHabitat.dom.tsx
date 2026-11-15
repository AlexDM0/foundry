/**
 * `useQuestionsHabitat` under the Bridge's host of Flint. What matters: the view is the `questions` habitat; the facts it mounts with send
 * nothing; a decision that waits with none selected reaches Flint as its cue; and a decision that is answered and an incident that settles
 * reach Flint as their cues, each once, and the habitat suggests happy for both.
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

test('a decision that is answered and an incident that settles reach Flint as their cues, once, each answered by happy', () => {
  const asked = {
    ...NOTHING_OPEN,
    history: [
      { kind: 'decision-opened', decisionId: 'D1', fields: { kind: 'agent-question', ticketIds: [] } },
      { kind: 'incident-opened', incidentId: 'I1', fields: { kind: 'gate-red', ticketIds: [] } },
    ],
  };
  const scene = sceneOfQuestions();
  scene.show(asked);
  const answered = { ...asked, history: [...asked.history, { kind: 'decision-answered', decisionId: 'D1', fields: { answer: {} } }] };
  expect(scene.cuesReceived(() => scene.show(answered))).toEqual(['decision-answered']);
  const settled = { ...answered, history: [...answered.history, { kind: 'incident-handled', incidentId: 'I1', fields: { move: 'retry' } }] };
  const digests = scene.perceived(() => scene.show(settled));
  expect(digests.flatMap((digest) => digest.newCues)).toEqual(['incident-settled']);
  const answers = digests.at(-1)?.suggestions.filter((suggestion) => suggestion.when === 'incident-settled' || suggestion.when === 'decision-answered');
  expect(answers?.map((suggestion) => suggestion.respond)).toEqual(['happy', 'happy']);
});
