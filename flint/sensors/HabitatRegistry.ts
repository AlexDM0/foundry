/**
 * The habitats a host registered, with what the sensors learn about each: its cues, when the user last focused or clicked in it, when its
 * content last changed, and whether it is on the screen. It marks each element with `data-sprite-habitat`, and the drop target with
 * `data-sprite-drop-target`, so the host can style them; it reads no text of the page.
 */
import type { SpriteCue, SpriteHabitat } from '../SpriteHabitat.ts';
import { SENSORS }                       from '../constants/Sensors.ts';
import type { PerceivedCue }             from '../mind/Perception.ts';

export interface HabitatRecord {
  readonly id:                    string;
  readonly element:               HTMLElement;
  readonly habitat:               SpriteHabitat;
  readonly focusedOrClickedOrder: number | null;
  readonly changedOrder:          number | null;
  readonly isOnScreen:            boolean;
}

export interface HabitatRegistryOptions {
  readonly document:             Document;
  readonly home:                 HTMLElement;
  /** Watch the habitats' content with a mutation observer, for the `content-changed-last` policy. */
  readonly tracksContentChanges: boolean;
}

export interface HabitatRegistry {
  /** Returns the function that removes the habitat. */
  readonly register:       (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  /** A cue on a habitat's element, or on an element inside it; false when no registered habitat holds the element. */
  readonly cue:            (element: Element, cueName: SpriteCue) => boolean;
  readonly records:        () => readonly HabitatRecord[];
  readonly recordById:     (habitatId: string) => HabitatRecord | null;
  readonly drainCues:      () => readonly PerceivedCue[];
  readonly homeIsOnScreen: () => boolean;
  readonly markDropTarget: (habitatId: string | null) => void;
  readonly destroy:        () => void;
}

interface MutableRecord {
  readonly id:           string;
  readonly element:      HTMLElement;
  readonly habitat:      SpriteHabitat;
  focusedOrClickedOrder: number | null;
  changedOrder:          number | null;
  isOnScreen:            boolean;
}

export function createHabitatRegistry(options: HabitatRegistryOptions): HabitatRegistry {
  const { document, home } = options;
  const view = document.defaultView;
  const recordsByElement = new Map<Element, MutableRecord>();
  let pendingCues: PerceivedCue[] = [];
  let registeredCount = 0;
  let happeningOrder = 0;
  let homeIsOnScreen = true;
  let dropTarget: MutableRecord | null = null;

  const recordHolding = (node: EventTarget | Node | null): MutableRecord | null => {
    let element: Element | null = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    while (element !== null) {
      const record = recordsByElement.get(element);
      if (record !== undefined) return record;
      element = element.parentElement;
    }
    return null;
  };

  const intersectionObserver = view !== null && 'IntersectionObserver' in view
    ? new view.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === home) homeIsOnScreen = entry.isIntersecting;
        const record = recordsByElement.get(entry.target);
        if (record !== undefined) record.isOnScreen = entry.isIntersecting;
      }
    })
    : null;
  intersectionObserver?.observe(home);

  const mutationObserver = options.tracksContentChanges && view !== null && 'MutationObserver' in view
    ? new view.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const record = recordHolding(mutation.target);
        if (record !== null) record.changedOrder = ++happeningOrder;
      }
    })
    : null;

  const onFocusOrPress = (event: Event): void => {
    const record = recordHolding(event.target);
    if (record !== null) record.focusedOrClickedOrder = ++happeningOrder;
  };
  document.addEventListener('focusin', onFocusOrPress, true);
  document.addEventListener('pointerdown', onFocusOrPress, true);

  return {
    register: (element, habitat) => {
      const record: MutableRecord = {
        id: `habitat-${++registeredCount}`, element, habitat, focusedOrClickedOrder: null, changedOrder: null, isOnScreen: true,
      };
      recordsByElement.set(element, record);
      element.setAttribute(SENSORS.HABITAT_ATTRIBUTE, habitat.kind);
      intersectionObserver?.observe(element);
      mutationObserver?.observe(element, { childList: true, subtree: true, characterData: true });
      return () => {
        if (recordsByElement.get(element) !== record) return;
        recordsByElement.delete(element);
        element.removeAttribute(SENSORS.HABITAT_ATTRIBUTE);
        if (dropTarget === record) {
          element.removeAttribute(SENSORS.DROP_TARGET_ATTRIBUTE);
          dropTarget = null;
        }
        if (element !== home) intersectionObserver?.unobserve(element);
      };
    },
    cue: (element, cueName) => {
      const record = recordHolding(element);
      if (record === null) return false;
      pendingCues.push({ habitatId: record.id, cue: cueName });
      record.changedOrder = ++happeningOrder;
      return true;
    },
    records:    () => [...recordsByElement.values()],
    recordById: (habitatId) => [...recordsByElement.values()].find((record) => record.id === habitatId) ?? null,
    drainCues:  () => {
      const drained = pendingCues;
      pendingCues = [];
      return drained;
    },
    homeIsOnScreen: () => homeIsOnScreen,
    markDropTarget: (habitatId) => {
      const target = habitatId === null ? null : [...recordsByElement.values()].find((record) => record.id === habitatId) ?? null;
      if (target === dropTarget) return;
      dropTarget?.element.removeAttribute(SENSORS.DROP_TARGET_ATTRIBUTE);
      target?.element.setAttribute(SENSORS.DROP_TARGET_ATTRIBUTE, '');
      dropTarget = target;
    },
    destroy: () => {
      document.removeEventListener('focusin', onFocusOrPress, true);
      document.removeEventListener('pointerdown', onFocusOrPress, true);
      intersectionObserver?.disconnect();
      mutationObserver?.disconnect();
      dropTarget?.element.removeAttribute(SENSORS.DROP_TARGET_ATTRIBUTE);
      for (const record of recordsByElement.values()) record.element.removeAttribute(SENSORS.HABITAT_ATTRIBUTE);
      recordsByElement.clear();
      pendingCues = [];
    },
  };
}
