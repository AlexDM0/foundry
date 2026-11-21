/**
 * The root a view mounts to draw one forge's board: the board's services for one tracker id, made once and kept while that forge shows,
 * and the shell keyed by the tracker id, so React unmounts one forge's board, its Flint with it, before it mounts another's. A document
 * holds one Flint, and two boards at once would make a second.
 */
import { useState, type ReactNode } from 'react';

import type { BoardServices }     from './@types/BoardServices.ts';
import { BoardCommandClient }     from './api/BoardCommandClient.ts';
import { BoardEventStreamClient } from './api/BoardEventStreamClient.ts';
import { BoardReadClient }        from './api/BoardReadClient.ts';
import { PictureUploadClient }    from './api/PictureUploadClient.ts';
import { ProfileStreamClient }    from './api/ProfileStreamClient.ts';
import { TranscriptStreamClient } from './api/TranscriptStreamClient.ts';
import { BROWSER_STORAGE_AREAS }  from './preferences/PreferenceStore.ts';
import { BoardApp }               from './shell/BoardApp.tsx';
import type { BoardRoute }        from './shell/BoardRouter.ts';
import type { BoardTabViewTable } from './shell/BoardTabViews.tsx';
import { QuestionAlerts }         from './views/questions/QuestionAlerts.ts';

/** Makes the services of one forge's board; called once for each tracker id the board is mounted for. */
export type BoardServicesOf = (trackerId: string) => BoardServices;

export interface BoardProps {
  readonly trackerId:      string;
  /** The route Gaia's address names; `null` for the forge alone. */
  readonly route:          BoardRoute | null;
  /** The forge's name until the first board names it. */
  readonly project:        string;
  readonly servicesOf:     BoardServicesOf;
  /** What the main area holds for a tab no view of the board draws yet. */
  readonly unmovedTabArea: (route: BoardRoute) => ReactNode;
  readonly tabViews?:      BoardTabViewTable;
}

/** What the browser's board needs of the page around it: the way to go to a fragment, and the page's one session loss. */
export interface BoardPageSurroundings {
  readonly goTo:           (fragment: string) => void;
  readonly sessionWasLost: () => void;
}

function BoardOfOneForge({ trackerId, servicesOf, ...shellProps }: BoardProps) {
  const [services] = useState(() => servicesOf(trackerId));
  return <BoardApp services={services} {...shellProps} />;
}

export function Board(props: BoardProps) {
  return <BoardOfOneForge key={props.trackerId} {...props} />;
}

/** Each client speaks to Gaia's relay for this tracker id alone, with the page's session. */
export function browserBoardServicesOf(trackerId: string, { goTo, sessionWasLost }: BoardPageSurroundings): BoardServices {
  const eventStreamSurroundings = BoardEventStreamClient.browserSurroundings(sessionWasLost);
  return {
    trackerId,
    commandClient:       BoardCommandClient.create(trackerId),
    pictureUploadClient: PictureUploadClient.create(trackerId),
    readBoard:           BoardReadClient.create(trackerId).read,
    openEventStream:     (handlers) => BoardEventStreamClient.open(trackerId, handlers, eventStreamSurroundings),
    followTranscript:    (jobId, handlers) => TranscriptStreamClient.follow(trackerId, jobId, handlers),
    followProfileLog:    (profileRunId, onLines) => ProfileStreamClient.follow(trackerId, profileRunId, { onLines }).close,
    storage:             BROWSER_STORAGE_AREAS.local,
    now:                 () => new Date(),
    questionNotifier:    QuestionAlerts.browserQuestionNotifier(),
    goTo,
  };
}
