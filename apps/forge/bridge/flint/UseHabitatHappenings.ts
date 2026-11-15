/**
 * Makes a view a habitat of Flint that answers the changes of its own facts (`09-bridge-wiring.md`, "New habitats"): it registers the
 * view's element, and after each new set of facts sends the cues its model gives between the last facts and these. A behaviour that takes
 * one of the view's elements is performed through Flint's handle with that element, found at the change, and only while Flint lives in
 * this habitat; with the element not on the page, its fallback cue is sent instead. The facts the view mounts with are no change.
 */

import type { SpriteCue, SpriteHabitat } from 'flint/SpriteHabitat';
import { useFlintHabitat }               from 'flint/react/UseFlintHabitat';
import { useFlintPerform }               from 'flint/react/UseFlintPerform';
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  type RefObject
} from 'react';
import { FlintDwellingContext } from './FlintDwelling.ts';

/** A behaviour that runs on one of the view's elements, named by the model with a key the view finds it by. */
export interface ElementHappening {
  readonly intent:      'chase-bug' | 'lay-bar-along';
  /** `null` when the model knows already that the view shows no such element. */
  readonly elementKey:  string | null;
  /** Sent in place of the behaviour when the element is not on the page. */
  readonly fallbackCue: SpriteCue;
}

/** In the order of the view's table; the first is sent last, so it is the newest cue, which the director answers. */
export interface HabitatHappenings {
  readonly cueNames:          readonly SpriteCue[];
  readonly elementHappenings: readonly ElementHappening[];
}

export interface HabitatHappeningsSource<Facts> {
  readonly viewElement:       RefObject<HTMLElement | null>;
  /** Keep it stable: a module constant. */
  readonly habitat:           SpriteHabitat;
  readonly facts:             Facts;
  readonly happeningsBetween: (previous: Facts, next: Facts) => HabitatHappenings;
  /** The view's element for a key, read inside the view's element; `null` when it is not on the page. */
  readonly elementOf:         (viewElement: HTMLElement, elementKey: string) => Element | null;
}

export function useHabitatHappenings<Facts>({
  viewElement, habitat, facts, happeningsBetween, elementOf
}: HabitatHappeningsSource<Facts>): void {
  const sendCue = useFlintHabitat(viewElement, habitat);
  const perform = useFlintPerform();
  const dwelling = useContext(FlintDwellingContext);
  const previousFacts = useRef(facts);
  useEffect(() => {
    if (previousFacts.current === facts) return;
    const happenings = happeningsBetween(previousFacts.current, facts);
    previousFacts.current = facts;
    const fallbackCueNames: SpriteCue[] = [];
    const performances: (readonly [ElementHappening['intent'], Element])[] = [];
    for (const happening of happenings.elementHappenings) {
      const view = viewElement.current;
      const element = view === null || happening.elementKey === null ? null : elementOf(view, happening.elementKey);
      if (element === null) fallbackCueNames.push(happening.fallbackCue);
      else if (dwelling.livesIn(habitat.kind)) performances.push([happening.intent, element]);
    }
    for (const cueName of [...happenings.cueNames, ...fallbackCueNames].reverse()) sendCue(cueName);
    // After the cues, so the behaviour is the newest intent.
    for (const [intent, element] of performances) perform(intent, element);
  }, [facts, happeningsBetween, elementOf, viewElement, habitat, sendCue, perform, dwelling]);
}

const NO_ELEMENT = (): null => null;

/** A habitat whose model gives only cues: `cuesBetween` in the order of the view's table. Keep `cuesBetween` stable. */
export function useHabitatCues<Facts>(
  viewElement: RefObject<HTMLElement | null>,
  habitat: SpriteHabitat,
  facts: Facts,
  cuesBetween: (previous: Facts, next: Facts) => readonly SpriteCue[],
): void {
  const happeningsBetween = useMemo(
    () => (previous: Facts, next: Facts): HabitatHappenings => ({ cueNames: cuesBetween(previous, next), elementHappenings: [] }),
    [cuesBetween],
  );
  useHabitatHappenings({
    viewElement, habitat, facts, happeningsBetween, elementOf: NO_ELEMENT
  });
}
