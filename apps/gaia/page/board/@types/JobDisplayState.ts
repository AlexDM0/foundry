import type { BoardDisplayState } from '../../@types/board/BoardVocabulary.ts';

/** An interrupted job that waits by a cause the board words on its own: a network outage, or the forge's lost supervision. */
export type InterruptionWaitState = 'network-outage' | 'not-supervised';

/** The look and word of a job: the display state nearest its state, or the wait its interruption names. */
export type JobDisplayState = BoardDisplayState | InterruptionWaitState;
