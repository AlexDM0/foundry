/**
 * The Bridge's host of Flint (`flint/`), the sprite of its agents: the home corner, a fixed box at the bottom right of the page; the
 * habitat Flint lives in, stored per board once the board is known; and the visit target, the habitat User last focused or clicked,
 * counted over its workplace (`bridge/flint/LastWorkedInTracker.ts`). The habitats are the components below it that call
 * `useFlintHabitat`. Every choice here is the host's, and easy to change.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { FlintHandle, FlintOptions } from '../../flint/CreateFlint.ts';
import { Flint }                          from '../../flint/react/Flint.tsx';
import type { PreferenceStore }           from '../preferences/PreferenceStore.ts';
import { flintHabitatStorageOf }          from './FlintHabitatStorage.ts';
import { createLastWorkedInTracker }      from './LastWorkedInTracker.ts';

/** Flint is 40 by 50 units; at this size it takes 30 by 37.5 pixels. */
const PIXELS_FOR_ONE_UNIT = 0.75;

export type FlintFrameSource = NonNullable<FlintOptions['frameSource']>;

export interface BridgeFlintProps {
  /** The board's preferences; `null` until the board is known, and Flint stores nothing until then. */
  readonly boardStore:   PreferenceStore | null;
  /** The default is the browser's animation frames; a DOM spec gives its own. */
  readonly frameSource?: FlintFrameSource;
  /** Called with Flint's handle once it exists and with null once it is gone, for `perform` and a brain. */
  readonly onHandle?:    (handle: FlintHandle | null) => void;
  readonly children:     ReactNode;
}

export function BridgeFlint({
  boardStore, frameSource, onHandle, children
}: BridgeFlintProps) {
  const home = useRef<HTMLDivElement>(null);
  const storage = useMemo(() => (boardStore === null ? undefined : flintHabitatStorageOf(boardStore)), [boardStore]);
  const [lastWorkedIn] = useState(createLastWorkedInTracker);
  useEffect(() => lastWorkedIn.follow(document), [lastWorkedIn]);
  return (
    <>
      <Flint
        home={home}
        pixelsForOneUnit={PIXELS_FOR_ONE_UNIT}
        visitTarget={lastWorkedIn.visitTarget}
        {...(storage === undefined ? {} : { storage })}
        {...(frameSource === undefined ? {} : { frameSource })}
        {...(onHandle === undefined ? {} : { onHandle })}
      >
        {children}
      </Flint>
      <div className="bridge-flint-home" ref={home} aria-hidden="true" />
    </>
  );
}
