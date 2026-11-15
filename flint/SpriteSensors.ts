/**
 * The sensors stage (`03-behaviour-and-architecture.md`, "The pattern"): the one part besides the renderer that touches the page. On each
 * frame it measures the home and the habitats against the overlay, reads the pointer and the cues, and gives the mind one `Perception` in
 * overlay units. It also says when Flint must stop: the tab is hidden, or the place Flint stands on is off the screen.
 */
import type {
  RegisteredHabitat,
  SpriteCue,
  SpriteHabitat,
  VisitTargetPolicy
} from './SpriteHabitat.ts';
import { isSpriteIntent }              from './SpriteHabitat.ts';
import { HABITAT_MINIMUM_SIDE_PIXELS } from './constants/Overlay.ts';
import type { StandingPlace }          from './mind/MindState.ts';
import type {
  PerceivedCopyTarget,
  PerceivedHabitat,
  PerceivedTarget,
  Perception,
  PlaceBox,
  PointerHappening
} from './mind/Perception.ts';
import { NO_TARGET }                                from './mind/Perception.ts';
import type { HabitatRecord }                       from './sensors/HabitatRegistry.ts';
import { createHabitatRegistry }                    from './sensors/HabitatRegistry.ts';
import type { ClientPoint, SensedPointerHappening } from './sensors/PointerSensor.ts';
import { createPointerSensor }                      from './sensors/PointerSensor.ts';
import type { VisitCandidate }                      from './sensors/VisitTargetSelection.ts';
import { visitTargetIdOf }                          from './sensors/VisitTargetSelection.ts';

export interface SpriteSensorsOptions {
  readonly document:         Document;
  /** Flint's overlay: every box is measured against it, so a scroll or a transform moves both alike. */
  readonly overlay:          Element;
  /** The one element of Flint that takes pointer input. */
  readonly bodyElement:      HTMLElement | SVGElement;
  readonly home:             HTMLElement;
  readonly pixelsForOneUnit: number;
  readonly visitTarget:      VisitTargetPolicy;
}

export interface PerceptionRequest {
  /** The habitat whose copy target is read: the one Flint lives in. */
  readonly copyTargetHabitatId: string | null;
  /** The kind the host's storage remembers, while Flint may still move there. */
  readonly storedHabitatKind:   string | null;
  readonly reducedMotion:       boolean;
  /** The element the host gave with its intent, to a gesture that aims or to a behaviour; its box is perceived on each frame. */
  readonly targetElement:       Element | null;
}

export interface SpriteSensors {
  readonly registerHabitat:  (element: HTMLElement, habitat: SpriteHabitat) => () => void;
  readonly cue:              (element: Element, cueName: SpriteCue) => void;
  readonly isPaused:         (place: StandingPlace) => boolean;
  readonly perceive:         (request: PerceptionRequest) => Perception;
  /** The habitat the visit-target policy picks now, when it is not the one Flint lives in. */
  readonly visitTargetIdFor: (livesIn: string | null) => string | null;
  readonly registeredOf:     (habitatId: string) => RegisteredHabitat | null;
  readonly destroy:          () => void;
}

interface MeasuredHabitat {
  readonly record:    HabitatRecord;
  readonly rectangle: DOMRect;
}

function rectangleIsRoomy(rectangle: DOMRect): boolean {
  return rectangle.width >= HABITAT_MINIMUM_SIDE_PIXELS && rectangle.height >= HABITAT_MINIMUM_SIDE_PIXELS;
}

function rectangleHolds(rectangle: DOMRect, point: ClientPoint): boolean {
  return point.x >= rectangle.left && point.x <= rectangle.right && point.y >= rectangle.top && point.y <= rectangle.bottom;
}

export function createSpriteSensors(options: SpriteSensorsOptions): SpriteSensors {
  const {
    document, overlay, home, pixelsForOneUnit
  } = options;
  const registry = createHabitatRegistry({ document, home, tracksContentChanges: options.visitTarget === 'content-changed-last' });
  const pointerSensor = createPointerSensor({ document, bodyElement: options.bodyElement });
  let lastPointer: ClientPoint | null = null;

  const measuredHabitats = (): readonly MeasuredHabitat[] => registry.records().map((record) => ({ record, rectangle: record.element.getBoundingClientRect() }));

  /** The innermost roomy habitat below a point: the drop target. */
  const roomyHabitatAt = (measured: readonly MeasuredHabitat[], point: ClientPoint): HabitatRecord | null => {
    let found: MeasuredHabitat | null = null;
    for (const candidate of measured) {
      if (!rectangleIsRoomy(candidate.rectangle) || !rectangleHolds(candidate.rectangle, point)) continue;
      if (found === null || candidate.rectangle.width * candidate.rectangle.height < found.rectangle.width * found.rectangle.height) found = candidate;
    }
    return found?.record ?? null;
  };

  const perceive = (request: PerceptionRequest): Perception => {
    const overlayRectangle = overlay.getBoundingClientRect();
    const boxOf = (rectangle: DOMRect): PlaceBox => ({
      leftX:  (rectangle.left - overlayRectangle.left) / pixelsForOneUnit,
      rightX: (rectangle.right - overlayRectangle.left) / pixelsForOneUnit,
      topY:   (rectangle.top - overlayRectangle.top) / pixelsForOneUnit,
      floorY: (rectangle.bottom - overlayRectangle.top) / pixelsForOneUnit,
    });
    const copyTargetOf = (record: HabitatRecord): PerceivedCopyTarget | null => {
      if (record.id !== request.copyTargetHabitatId) return null;
      const target = record.habitat.copyTargetFor?.() ?? null;
      if (target === null || !isSpriteIntent(target.intent)) return null;
      const rectangle = target.element.getBoundingClientRect();
      return { centreX: ((rectangle.left + rectangle.right) / 2 - overlayRectangle.left) / pixelsForOneUnit, intent: target.intent };
    };
    const measured = measuredHabitats();
    const habitats: PerceivedHabitat[] = measured.map(({ record, rectangle }) => ({
      id:               record.id,
      kind:             record.habitat.kind,
      box:              boxOf(rectangle),
      isRoomy:          rectangleIsRoomy(rectangle),
      copyTarget:       copyTargetOf(record),
      keepsFlintInside: record.habitat.keepsFlintInside === true,
    }));
    const reading = pointerSensor.readingOfFrame();
    lastPointer = reading.position;
    registry.markDropTarget(reading.isDragging && reading.position !== null ? roomyHabitatAt(measured, reading.position)?.id ?? null : null);
    const happeningOf = (sensed: SensedPointerHappening): PointerHappening => {
      if (sensed.kind !== 'dropped') return sensed;
      return { kind: 'dropped', habitatId: sensed.at === null ? null : roomyHabitatAt(measured, sensed.at)?.id ?? null };
    };
    const targetOf = (element: Element | null): PerceivedTarget => {
      if (element === null) return NO_TARGET;
      return element.isConnected ? { kind: 'on-the-page', box: boxOf(element.getBoundingClientRect()) } : { kind: 'gone' };
    };
    const stored = request.storedHabitatKind === null ? undefined : habitats.find((habitat) => habitat.isRoomy && habitat.kind === request.storedHabitatKind);
    return {
      home:    boxOf(home.getBoundingClientRect()),
      habitats,
      pointer: reading.position === null
        ? null
        : { x: (reading.position.x - overlayRectangle.left) / pixelsForOneUnit, y: (reading.position.y - overlayRectangle.top) / pixelsForOneUnit, hasMoved: reading.hasMoved },
      happenings:      reading.happenings.map(happeningOf),
      cues:            registry.drainCues(),
      storedHabitatId: stored?.id ?? null,
      stageWidthUnits: overlayRectangle.width / pixelsForOneUnit,
      target:          targetOf(request.targetElement),
      reducedMotion:   request.reducedMotion,
    };
  };

  return {
    registerHabitat: registry.register,
    cue:             (element, cueName) => {
      registry.cue(element, cueName);
    },
    isPaused: (place) => {
      if (document.visibilityState === 'hidden') return true;
      if (place.kind === 'home') return !registry.homeIsOnScreen();
      if (place.kind !== 'habitat') return false;
      const record = registry.recordById(place.habitatId);
      // A habitat with no box at all, such as one set to `display: none`, goes on, so the reflex that sends Flint home from it runs.
      return record?.isOnScreen === false && record.element.getClientRects().length > 0;
    },
    perceive,
    visitTargetIdFor: (livesIn) => {
      const candidates: VisitCandidate[] = measuredHabitats().map(({ record, rectangle }) => ({
        id:                    record.id,
        registered:            { element: record.element, habitat: record.habitat },
        isRoomy:               rectangleIsRoomy(rectangle),
        area:                  rectangle.width * rectangle.height,
        containsPointer:       lastPointer !== null && rectangleHolds(rectangle, lastPointer),
        focusedOrClickedOrder: record.focusedOrClickedOrder,
        changedOrder:          record.changedOrder,
      }));
      const targetId = visitTargetIdOf(options.visitTarget, candidates);
      return targetId === livesIn ? null : targetId;
    },
    registeredOf: (habitatId) => {
      const record = registry.recordById(habitatId);
      return record === null ? null : { element: record.element, habitat: record.habitat };
    },
    destroy: () => {
      pointerSensor.destroy();
      registry.destroy();
    },
  };
}
