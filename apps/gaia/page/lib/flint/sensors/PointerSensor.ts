/**
 * The pointer, in client pixels: where it is, whether it moved, and whether a press on Flint's body became a click or a drag. Only the body
 * takes the press, so a click anywhere else reaches the page below. The body captures the pointer and takes no touch gesture, so a touch
 * drag carries Flint and a release outside the page still ends it.
 */
import { SENSORS } from '../constants/Sensors.ts';

export interface ClientPoint {
  readonly x: number;
  readonly y: number;
}

export type SensedPointerHappening =
  | { readonly kind: 'clicked' }
  | { readonly kind: 'drag-started' }
  /** Null is a cancelled drag, which drops on nothing. */
  | { readonly kind: 'dropped'; readonly at: ClientPoint | null };

export interface PointerReading {
  /** Null while the pointer is outside the page. */
  readonly position:   ClientPoint | null;
  readonly hasMoved:   boolean;
  readonly isDragging: boolean;
  readonly happenings: readonly SensedPointerHappening[];
}

export interface PointerSensorOptions {
  readonly document:    Document;
  readonly bodyElement: HTMLElement | SVGElement;
}

export interface PointerSensor {
  /** What happened since the last reading; each happening is read once. */
  readonly readingOfFrame: () => PointerReading;
  readonly destroy:        () => void;
}

/** The sensor of a Flint that stays in its box: it listens to nothing, so the pointer is never on the page and nothing is ever pressed. */
export const BLIND_POINTER_SENSOR: PointerSensor = Object.freeze({
  readingOfFrame: () => ({
    position: null, hasMoved: false, isDragging: false, happenings: [],
  }),
  destroy: () => undefined,
});

interface Press {
  readonly startedAt: ClientPoint;
  readonly pointerId: number;
  isDragging:         boolean;
}

export function createPointerSensor(options: PointerSensorOptions): PointerSensor {
  const { document, bodyElement } = options;
  let position: ClientPoint | null = null;
  let hasMoved = false;
  let press: Press | null = null;
  let happenings: SensedPointerHappening[] = [];

  const onBodyPress = (event: Event): void => {
    if (!(event instanceof PointerEvent) || event.button !== SENSORS.PRIMARY_POINTER_BUTTON) return;
    event.preventDefault();
    bodyElement.setPointerCapture(event.pointerId);
    position = { x: event.clientX, y: event.clientY };
    press = { startedAt: position, pointerId: event.pointerId, isDragging: false };
  };
  const onMove = (event: PointerEvent): void => {
    position = { x: event.clientX, y: event.clientY };
    hasMoved = true;
    if (press === null || press.isDragging || event.pointerId !== press.pointerId) return;
    if (Math.hypot(position.x - press.startedAt.x, position.y - press.startedAt.y) <= SENSORS.DRAG_THRESHOLD_PIXELS) return;
    press.isDragging = true;
    happenings.push({ kind: 'drag-started' });
  };
  const onRelease = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.pointerId) return;
    position = { x: event.clientX, y: event.clientY };
    happenings.push(press.isDragging ? { kind: 'dropped', at: position } : { kind: 'clicked' });
    press = null;
  };
  const onCancel = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.pointerId) return;
    if (press.isDragging) happenings.push({ kind: 'dropped', at: null });
    press = null;
  };
  const onLeavePage = (event: PointerEvent): void => {
    if (event.relatedTarget === null && press === null) position = null;
  };

  bodyElement.style.touchAction = 'none';
  bodyElement.addEventListener('pointerdown', onBodyPress);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onRelease);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('pointerout', onLeavePage);

  return {
    readingOfFrame: () => {
      const reading: PointerReading = {
        position, hasMoved, isDragging: press?.isDragging ?? false, happenings,
      };
      hasMoved = false;
      happenings = [];
      return reading;
    },
    destroy: () => {
      bodyElement.removeEventListener('pointerdown', onBodyPress);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onRelease);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('pointerout', onLeavePage);
    },
  };
}
