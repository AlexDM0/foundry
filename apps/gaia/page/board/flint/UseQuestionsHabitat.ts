/**
 * Makes a view of the questions, the Questions view or the question panel, the questions habitat of Flint: it registers the view's element
 * and, after each new set of facts, sends the cues of `QuestionsSpriteModel`, the first row last so it is the newest. The facts the view
 * mounts with are no change.
 */
import { useFlintHabitat }                   from 'flint/react/UseFlintHabitat';
import { useEffect, useRef, type RefObject } from 'react';

import { QUESTIONS_SPRITE_HABITAT }                  from './QuestionsSpriteHabitat.ts';
import { QuestionsSpriteModel, type QuestionsFacts } from './QuestionsSpriteModel.ts';

/** Keep `facts` the same object while they are the same, as a memo of the board and the selection. */
export function useQuestionsHabitat(viewElement: RefObject<HTMLElement | null>, facts: QuestionsFacts): void {
  const sendCue = useFlintHabitat(viewElement, QUESTIONS_SPRITE_HABITAT);
  const reading = useRef(QuestionsSpriteModel.firstReadingOf(facts));
  useEffect(() => {
    if (reading.current.facts === facts) return;
    const step = QuestionsSpriteModel.stepOf(reading.current, facts);
    reading.current = step.reading;
    for (const cueName of [...step.cueNames].reverse()) sendCue(cueName);
  }, [facts, sendCue]);
}
