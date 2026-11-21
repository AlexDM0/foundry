/**
 * The board's host of Flint (`flint/`), the sprite of its agents: the home corner, a fixed box at the bottom right of the page; the
 * habitat Flint lives in, stored per board once the board is known, and asked of the handle for the views that start a behaviour on one of
 * their elements (`page/board/flint/FlintDwelling.ts`); the visit target, the open screen's Flint slot unless User focused or clicked in
 * another habitat since it showed (`page/board/flint/VisitTargetTracker.ts`), which each slot reaches through `FlintSlotShowingContext`, and
 * where Flint goes at once when a slot shows or Flint is made, not at its director's next turn, so it never waits at home on a screen; and
 * the board occasions, which Flint answers wherever it is (`page/board/flint/UseBoardOccasions.ts`). Flint has no brain here: its rule
 * director alone moves it, Gaia makes no model call for it, and one forge route mounts one host (the package refuses a second). The habitats
 * are the components below it that call `useFlintHabitat`; a component below it that starts an intent with one of its own elements calls
 * `useFlintPerform`. For now Flint stays in its box (`FLINT_CONFINEMENT`): it shows only inside its home or the slot it lives in, nobody
 * carries it and it ignores the pointer. Every choice here is the host's, and easy to change.
 */

import type { FlintHandle, FlintOptions } from 'flint';
import { Flint }                          from 'flint/react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { PreferenceStore }             from '../preferences/PreferenceStore.ts';
import type { BoardReading }                from './BoardOccasionModel.ts';
import { dwellingOf, FlintDwellingContext } from './FlintDwelling.ts';
import { flintHabitatStorageOf }            from './FlintHabitatStorage.ts';
import { FlintSlotShowingContext }          from './FlintSlotShowing.ts';
import { useBoardOccasions }                from './UseBoardOccasions.ts';
import { createVisitTargetTracker }         from './VisitTargetTracker.ts';

/** Flint is 40 by 50 units; at this size it takes 30 by 37.5 pixels. */
const PIXELS_FOR_ONE_UNIT = 0.75;

/** `roams-the-page` lets Flint come around a habitat's corner, be carried by the pointer and play with it again. */
const FLINT_CONFINEMENT: NonNullable<FlintOptions['confinement']> = 'stays-in-its-box';

export type FlintFrameSource = NonNullable<FlintOptions['frameSource']>;

export interface BoardFlintProps {
  /** The board's preferences; `null` until the board is known, and Flint stores nothing until then. */
  readonly boardStore:    PreferenceStore | null;
  /** The default is the browser's animation frames; a DOM spec gives its own. */
  readonly frameSource?:  FlintFrameSource;
  /** Read once: called with Flint's handle once it exists and with null once it is gone, for `perform`. */
  readonly onHandle?:     (handle: FlintHandle | null) => void;
  /** The board, the connection and the refused commands Flint answers; absent, it answers no board occasion and shows no sparks. */
  readonly boardReading?: BoardReading;
  readonly children:      ReactNode;
}

export function BoardFlint({
  boardStore, frameSource, onHandle, boardReading, children
}: BoardFlintProps) {
  const home = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<FlintHandle | null>(null);
  const [visitTargetTracker] = useState(createVisitTargetTracker);
  const [takeHandle] = useState(() => (made: FlintHandle | null): void => {
    visitTargetTracker.flintMade(made);
    setHandle(made);
    onHandle?.(made);
  });
  useBoardOccasions(handle, boardReading ?? null);
  const dwelling = useMemo(() => dwellingOf(handle), [handle]);
  const storage = useMemo(() => (boardStore === null ? null : flintHabitatStorageOf(boardStore)), [boardStore]);
  useEffect(() => visitTargetTracker.follow(document), [visitTargetTracker]);
  return (
    <FlintDwellingContext.Provider value={dwelling}>
      <FlintSlotShowingContext.Provider value={visitTargetTracker.slotShown}>
        <Flint
          home={home}
          pixelsForOneUnit={PIXELS_FOR_ONE_UNIT}
          confinement={FLINT_CONFINEMENT}
          visitTarget={visitTargetTracker.visitTarget}
          {...(storage === null ? {} : { storage })}
          {...(frameSource === undefined ? {} : { frameSource })}
          onHandle={takeHandle}
        >
          {children}
        </Flint>
      </FlintSlotShowingContext.Provider>
      <div className="board-flint-home" ref={home} aria-hidden="true" />
    </FlintDwellingContext.Provider>
  );
}
