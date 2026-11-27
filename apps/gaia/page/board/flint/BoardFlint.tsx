/**
 * The board's host of Flint: the home corner, the habitat stored per board, the visit target and the board occasions. Its rule director alone
 * moves Flint, Gaia makes no model call for it, and one forge route mounts one host. For now Flint stays in its box (`FLINT_CONFINEMENT`).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Flint, type FlintHandle, type FlintOptions } from '../../lib/flint/FlintInterface.ts';
import type { PreferenceStore }                       from '../preferences/PreferenceStore.ts';
import type { BoardReading }                          from './BoardOccasionModel.ts';
import { dwellingOf, FlintDwellingContext }           from './FlintDwelling.ts';
import { flintHabitatStorageOf }                      from './FlintHabitatStorage.ts';
import { FlintSlotShowingContext }                    from './FlintSlotShowing.ts';
import { BOARD_FLINT_PIXELS_FOR_ONE_UNIT }            from './FlintStripSlot.ts';
import { useBoardOccasions }                          from './UseBoardOccasions.ts';
import { createVisitTargetTracker }                   from './VisitTargetTracker.ts';


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
          pixelsForOneUnit={BOARD_FLINT_PIXELS_FOR_ONE_UNIT}
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
