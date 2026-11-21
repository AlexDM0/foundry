/** How the board words a display state on its badges; the state itself is the Board's fact, never the board's. */
import type { BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';

const STATE_LABEL_FOR_DISPLAY_STATE: Readonly<Record<BoardDisplayState, string>> = {
  'draft':            'Draft',
  'ready-for-review': 'Ready for review',
  'committed':        'To do',
  'in-progress':      'In progress',
  'paused':           'Paused',
  'in-review':        'Awaiting review',
  'reviewing':        'Reviewing',
  're-review':        'Reviewing',
  'reviewed':         'Awaiting merge',
  'delivered':        'Done',
  'abandoned':        'Abandoned',
};

/** Whether a stored word is a display state, so a ticket status from outside the Board can take its badge. */
function isDisplayState(word: string): word is BoardDisplayState {
  return Object.hasOwn(STATE_LABEL_FOR_DISPLAY_STATE, word);
}

function labelOf(state: BoardDisplayState): string {
  return STATE_LABEL_FOR_DISPLAY_STATE[state];
}

/** A repeat review names its round: `Reviewing (round 2)`. */
function stateLabelOf(state: BoardDisplayState, reviewRound: number): string {
  return state === 're-review' ? `${labelOf(state)} (round ${reviewRound})` : labelOf(state);
}

export const DisplayStateWordingUtil = Object.freeze({ isDisplayState, labelOf, stateLabelOf });
