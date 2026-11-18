/**
 * The Bridge's host of Flint (`flint/`), the sprite of its agents: the home corner, a fixed box at the bottom right of the page; the
 * habitat Flint lives in, stored per board once the board is known, and asked of the handle for the views that start a behaviour on one of
 * their elements (`bridge/flint/FlintDwelling.ts`); the visit target, the open screen's Flint slot unless User focused or clicked in
 * another habitat since it showed (`bridge/flint/VisitTargetTracker.ts`), which each slot reaches through `FlintSlotShowingContext`, and
 * where Flint goes at once when a slot shows or Flint is made, not at its director's next turn, so it never waits at home on a screen; and
 * the board occasions, which Flint answers wherever it is (`bridge/flint/UseBoardOccasions.ts`); and Flint's brain, its second director
 * over the ask route while the board says the Overseer runs it, until its run ends (`bridge/flint/FlintBrainDirector.ts`). The habitats
 * are the components below it that call `useFlintHabitat`; a component below it that starts an intent with one of its own elements calls
 * `useFlintPerform`. For now Flint stays in its box (`FLINT_CONFINEMENT`): it shows only inside its home or the slot it lives in, nobody
 * carries it and it ignores the pointer. Every choice here is the host's, and easy to change.
 */

import type { FlintHandle, FlintOptions } from 'flint';
import { Flint }                          from 'flint/react';
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { FlintBrainClient }            from '../api/FlintBrainClient.ts';
import type { PreferenceStore }             from '../preferences/PreferenceStore.ts';
import type { BoardReading }                from './BoardOccasionModel.ts';
import { FlintBrainDirector }               from './FlintBrainDirector.ts';
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

/** The Overseer's brain as the board reports it, the client that asks it, and the clock its run's end is read against. */
export interface BridgeFlintBrain {
  /** `null` where the forge cannot run the brain. */
  readonly reading:           MonitorFlintBrainDocument | null;
  readonly client:            FlintBrainClient;
  readonly now:               () => Date;
  /** The default is the page's own visibility; a DOM spec gives its own. */
  readonly documentIsHidden?: () => boolean;
}

export interface BridgeFlintProps {
  /** The board's preferences; `null` until the board is known, and Flint stores nothing until then. */
  readonly boardStore:    PreferenceStore | null;
  /** The default is the browser's animation frames; a DOM spec gives its own. */
  readonly frameSource?:  FlintFrameSource;
  /** Read once: called with Flint's handle once it exists and with null once it is gone, for `perform` and a brain. */
  readonly onHandle?:     (handle: FlintHandle | null) => void;
  /** The board, the connection and the refused commands Flint answers; absent, it answers no board occasion and shows no sparks. */
  readonly boardReading?: BoardReading;
  /** Absent, Flint has only its rule director. */
  readonly flintBrain?:   BridgeFlintBrain;
  readonly children:      ReactNode;
}

const PAGE_IS_HIDDEN = (): boolean => document.visibilityState === 'hidden';

/** While the board says the brain runs, Flint asks it for the run's remaining time; once the board says otherwise, it stops asking. */
function useFlintBrain(handle: FlintHandle | null, flintBrain: BridgeFlintBrain | undefined): void {
  const reading = flintBrain?.reading ?? null;
  const runEndsAt = reading?.state === 'running' ? reading.endsAt : null;
  const client = flintBrain?.client ?? null;
  const now = flintBrain?.now ?? null;
  const documentIsHidden = useRef(PAGE_IS_HIDDEN);
  useEffect(() => {
    documentIsHidden.current = flintBrain?.documentIsHidden ?? PAGE_IS_HIDDEN;
  });
  useEffect(() => {
    if (handle === null || client === null || now === null || runEndsAt === null) return undefined;
    // A clock exception: Flint gives its brain a span of frame time, so the run's stated end is read against the clock once, as it starts.
    const remainingMilliseconds = Date.parse(runEndsAt) - now().getTime();
    if (!(remainingMilliseconds > 0)) return undefined;
    handle.startBrain(FlintBrainDirector.create({ ask: client.ask, documentIsHidden: () => documentIsHidden.current() }), remainingMilliseconds);
    return () => handle.stopBrain();
  }, [handle, client, now, runEndsAt]);
}

export function BridgeFlint({
  boardStore, frameSource, onHandle, boardReading, flintBrain, children
}: BridgeFlintProps) {
  const home = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<FlintHandle | null>(null);
  const [visitTargetTracker] = useState(createVisitTargetTracker);
  const [takeHandle] = useState(() => (made: FlintHandle | null): void => {
    visitTargetTracker.flintMade(made);
    setHandle(made);
    onHandle?.(made);
  });
  useBoardOccasions(handle, boardReading ?? null);
  useFlintBrain(handle, flintBrain);
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
      <div className="bridge-flint-home" ref={home} aria-hidden="true" />
    </FlintDwellingContext.Provider>
  );
}
