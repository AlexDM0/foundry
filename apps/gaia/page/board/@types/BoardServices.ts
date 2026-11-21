/**
 * Everything a board reaches outside itself for one forge, handed in by whoever mounts it: the relay's clients for that forge, browser
 * storage, the clock and the page's route. The board names no address and holds no token; each client speaks to Gaia's relay alone.
 */
import type { FlintHandle }              from 'flint';
import type { BoardCommandClient }       from '../api/BoardCommandClient.ts';
import type { EventStreamHandlers }      from '../api/BoardEventStreamClient.ts';
import type { BoardRead }                from '../api/BoardReadClient.ts';
import type { PictureUploadClient }      from '../api/PictureUploadClient.ts';
import type { ProfileOutputLine }        from '../api/ProfileStreamClient.ts';
import type { TranscriptStreamHandlers } from '../api/TranscriptStreamClient.ts';
import type { FlintFrameSource }         from '../flint/BoardFlint.tsx';
import type { PreferenceStorage }        from '../preferences/PreferenceStore.ts';
import type { QuestionNotifier }         from '../views/questions/QuestionAlerts.ts';

/** Follows one job's transcript until closed. */
export type TranscriptFollower = (jobId: string, handlers: TranscriptStreamHandlers) => { close: () => void };

/** Follows one gate profile run's output until the returned function is called. */
export type ProfileLogFollower = (profileRunId: string, onLines: (lines: readonly ProfileOutputLine[]) => void) => () => void;

export interface BoardServices {
  readonly trackerId:           string;
  readonly commandClient:       BoardCommandClient;
  readonly pictureUploadClient: PictureUploadClient;
  /** Reads the board whole: once at the start and after each `board-changed`. */
  readonly readBoard:           () => Promise<BoardRead>;
  readonly openEventStream:     (handlers: EventStreamHandlers) => { close: () => void };
  readonly followTranscript:    TranscriptFollower;
  readonly followProfileLog:    ProfileLogFollower;
  readonly storage:             () => PreferenceStorage;
  readonly now:                 () => Date;
  /** The browser's notifications for questions, which the header's inbox lets User allow. */
  readonly questionNotifier:    QuestionNotifier;
  readonly goTo:                (fragment: string) => void;
  /** The default is the browser's animation frames; a DOM spec gives its own. */
  readonly flintFrameSource?:   FlintFrameSource;
  /** Called with Flint's handle once it exists and with null once it is gone. */
  readonly onFlintHandle?:      (handle: FlintHandle | null) => void;
}
