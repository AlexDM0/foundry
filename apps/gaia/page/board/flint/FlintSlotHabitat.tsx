/**
 * A Flint slot (`design-system/FlintSlot`) as the habitat of its screen: the box registers itself with the habitat of the screen, a module
 * constant of `FlintSlotHabitats.ts`; it sends its cue each time the screen's data changes it, and not the cue it mounts with, which is no
 * change, and a screen whose agent does one thing the whole time gives none; while its cue lasts, it offers Flint that answer to copy in
 * the box, so a Flint that arrives later keeps it up too; and it tells the host that it shows, so Flint visits the open screen's slot.
 */
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { FlintSlot, type FlintSlotGround, type FlintSlotSize } from '../../lib/design-system/DesignSystemInterface.ts';

import {
  type SpriteCopyTarget,
  type SpriteHabitat,
  type SpriteIntent,
  useFlintHabitat
} from '../../lib/flint/FlintInterface.ts';
import type { FlintSlotCue }       from './FlintSlotCues.ts';
import { lastingIntentOf }         from './FlintSlotHabitats.ts';
import { FlintSlotShowingContext } from './FlintSlotShowing.ts';
import { useCueOnChange }          from './UseCueOnChange.ts';

export interface FlintSlotHabitatProps {
  /** The screen's habitat, one of `FLINT_SLOT_HABITATS`. */
  readonly habitat: SpriteHabitat;
  /** `null` on a screen whose agent does one thing the whole time: Flint's arrival in the slot says it. */
  readonly cue:     FlintSlotCue | null;
  /** The slot's accessible name; `null` beside text that already says what the agent does. */
  readonly label:   string | null;
  readonly size?:   FlintSlotSize;
  readonly ground:  FlintSlotGround;
}

interface LastingCopy {
  /** Called in an effect after each render, with the slot's element, habitat and cue now. */
  readonly follow:        (slotElement: HTMLElement | null, habitat: SpriteHabitat, cue: FlintSlotCue | null) => void;
  readonly copyTargetFor: () => SpriteCopyTarget | null;
}

function createLastingCopy(): LastingCopy {
  let followedSlot: HTMLElement | null = null;
  let lastingIntent: SpriteIntent | null = null;
  return {
    follow: (slotElement, habitat, cue) => {
      followedSlot = slotElement;
      lastingIntent = cue === null ? null : lastingIntentOf(habitat, cue);
    },
    copyTargetFor: () => (followedSlot === null || lastingIntent === null ? null : { element: followedSlot, intent: lastingIntent }),
  };
}

export function FlintSlotHabitat({
  habitat, cue, label, size = '100', ground
}: FlintSlotHabitatProps) {
  const slotElement = useRef<HTMLDivElement>(null);
  const [lastingCopy] = useState(createLastingCopy);
  const registeredHabitat = useMemo(() => Object.freeze({ ...habitat, copyTargetFor: lastingCopy.copyTargetFor }), [habitat, lastingCopy]);
  const sendCue = useFlintHabitat(slotElement, registeredHabitat);
  useCueOnChange(sendCue, cue === null ? null : { cueName: cue, occasionKey: cue });
  useEffect(() => {
    lastingCopy.follow(slotElement.current, habitat, cue);
  }, [lastingCopy, habitat, cue]);
  const showSlot = useContext(FlintSlotShowingContext);
  useEffect(() => (slotElement.current === null ? undefined : showSlot(slotElement.current)), [showSlot]);
  return <FlintSlot label={label} size={size} ground={ground} slotRef={slotElement} />;
}
