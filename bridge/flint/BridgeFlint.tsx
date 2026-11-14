/**
 * The Bridge's host of Flint (`flint/`), the sprite of its agents: the home corner, a fixed box at the bottom right of the page; the
 * habitat Flint lives in, stored per board once the board is known, and asked of the handle for the views that start a behaviour on one of
 * their elements (`bridge/flint/FlintDwelling.ts`); and the visit target, the habitat User last focused or clicked, counted over its
 * workplace (`bridge/flint/LastWorkedInTracker.ts`); and the board occasions, which Flint answers wherever it is
 * (`bridge/flint/UseBoardOccasions.ts`). The habitats are the components below it that call `useFlintHabitat`; a component below it that
 * starts an intent with one of its own elements calls `useFlintPerform`. Every choice here is the host's, and easy to change.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { FlintHandle, FlintOptions }   from '../../flint/CreateFlint.ts';
import { Flint }                            from '../../flint/react/Flint.tsx';
import type { PreferenceStore }             from '../preferences/PreferenceStore.ts';
import type { BoardReading }                from './BoardOccasionModel.ts';
import { dwellingOf, FlintDwellingContext } from './FlintDwelling.ts';
import { flintHabitatStorageOf }            from './FlintHabitatStorage.ts';
import { createLastWorkedInTracker }        from './LastWorkedInTracker.ts';
import { useBoardOccasions }                from './UseBoardOccasions.ts';

/** Flint is 40 by 50 units; at this size it takes 30 by 37.5 pixels. */
const PIXELS_FOR_ONE_UNIT = 0.75;

export type FlintFrameSource = NonNullable<FlintOptions['frameSource']>;

export interface BridgeFlintProps {
  /** The board's preferences; `null` until the board is known, and Flint stores nothing until then. */
  readonly boardStore:    PreferenceStore | null;
  /** The default is the browser's animation frames; a DOM spec gives its own. */
  readonly frameSource?:  FlintFrameSource;
  /** Read once: called with Flint's handle once it exists and with null once it is gone, for `perform` and a brain. */
  readonly onHandle?:     (handle: FlintHandle | null) => void;
  /** The board, the connection and the refused commands Flint answers; absent, it answers no board occasion and shows no sparks. */
  readonly boardReading?: BoardReading;
  readonly children:      ReactNode;
}

export function BridgeFlint({
  boardStore, frameSource, onHandle, boardReading, children
}: BridgeFlintProps) {
  const home = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<FlintHandle | null>(null);
  const [takeHandle] = useState(() => (made: FlintHandle | null): void => {
    setHandle(made);
    onHandle?.(made);
  });
  useBoardOccasions(handle, boardReading ?? null);
  const dwelling = useMemo(() => dwellingOf(handle), [handle]);
  const storage = useMemo(() => (boardStore === null ? null : flintHabitatStorageOf(boardStore)), [boardStore]);
  const [lastWorkedIn] = useState(createLastWorkedInTracker);
  useEffect(() => lastWorkedIn.follow(document), [lastWorkedIn]);
  return (
    <FlintDwellingContext.Provider value={dwelling}>
      <Flint
        home={home}
        pixelsForOneUnit={PIXELS_FOR_ONE_UNIT}
        visitTarget={lastWorkedIn.visitTarget}
        {...(storage === null ? {} : { storage })}
        {...(frameSource === undefined ? {} : { frameSource })}
        onHandle={takeHandle}
      >
        {children}
      </Flint>
      <div className="bridge-flint-home" ref={home} aria-hidden="true" />
    </FlintDwellingContext.Provider>
  );
}
