import type { BoardResumeWait } from '../../../shared/@types/board/BoardVocabulary.ts';

/** What each job of a forge's interrupted work waits for, by job id, as its presence serves it. */
export type ResumeWaitsOfJobs = ReadonlyMap<string, BoardResumeWait>;
