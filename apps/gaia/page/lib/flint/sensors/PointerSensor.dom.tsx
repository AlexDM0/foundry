/**
 * The pointer on a happy-dom page. What matters: a press on the body that moves no further than the threshold is a click, and one that
 * moves past it a drag whose release is a drop at the release point; a cancelled drag drops on nothing; a press with another button, or a
 * move of another pointer, does nothing; each happening is read once; a pointer that leaves the page is no pointer; and the body takes no
 * touch gesture and captures the pointer it is pressed with, so a touch drag carries Flint and does not scroll the page.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PointerSensor }  from './PointerSensor.ts';
import { createPointerSensor } from './PointerSensor.ts';

const sensors: PointerSensor[] = [];

afterEach(() => {
  for (const sensor of sensors.splice(0)) sensor.destroy();
  document.body.replaceChildren();
});

function sensorOnBody(): { readonly sensor: PointerSensor; readonly body: HTMLElement } {
  const body = document.createElement('div');
  document.body.appendChild(body);
  const sensor = createPointerSensor({ document, bodyElement: body });
  sensors.push(sensor);
  return { sensor, body };
}

function pointer(type: string, target: EventTarget, clientX: number, clientY: number, changes: PointerEventInit = {}): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX, clientY, ...changes,
  }));
}

test('the body takes no touch gesture, and captures the pointer it is pressed with', () => {
  const { body } = sensorOnBody();
  expect(body.style.touchAction).toBe('none');
  pointer('pointerdown', body, 100, 100, { pointerId: 7 });
  expect(body.hasPointerCapture(7)).toBe(true);
});

describe('a press on the body', () => {
  test('that moves no further than five pixels is a click', () => {
    const { sensor, body } = sensorOnBody();
    pointer('pointerdown', body, 100, 100);
    pointer('pointermove', document, 103, 104);
    pointer('pointerup', document, 103, 104);
    expect(sensor.readingOfFrame().happenings).toEqual([{ kind: 'clicked' }]);
  });

  test('that moves past five pixels is a drag, and its release a drop at the release point', () => {
    const { sensor, body } = sensorOnBody();
    pointer('pointerdown', body, 100, 100);
    pointer('pointermove', document, 104, 104);
    expect(sensor.readingOfFrame()).toMatchObject({ isDragging: true, happenings: [{ kind: 'drag-started' }], position: { x: 104, y: 104 } });
    pointer('pointerup', document, 300, 200);
    expect(sensor.readingOfFrame()).toMatchObject({ isDragging: false, happenings: [{ kind: 'dropped', at: { x: 300, y: 200 } }] });
  });

  test('a cancelled drag drops on nothing', () => {
    const { sensor, body } = sensorOnBody();
    pointer('pointerdown', body, 100, 100);
    pointer('pointermove', document, 200, 200);
    pointer('pointercancel', document, 200, 200);
    expect(sensor.readingOfFrame().happenings).toEqual([{ kind: 'drag-started' }, { kind: 'dropped', at: null }]);
  });

  test('a press with another button, or a move of another pointer, does nothing', () => {
    const { sensor, body } = sensorOnBody();
    pointer('pointerdown', body, 100, 100, { button: 2 });
    pointer('pointerup', document, 100, 100, { button: 2 });
    pointer('pointerdown', body, 100, 100);
    pointer('pointermove', document, 300, 300, { pointerId: 2 });
    expect(sensor.readingOfFrame()).toMatchObject({ isDragging: false, happenings: [] });
  });
});

describe('the pointer', () => {
  test('each happening and each move is read once', () => {
    const { sensor } = sensorOnBody();
    pointer('pointermove', document, 10, 20);
    expect(sensor.readingOfFrame()).toMatchObject({ hasMoved: true, position: { x: 10, y: 20 } });
    expect(sensor.readingOfFrame()).toMatchObject({ hasMoved: false, position: { x: 10, y: 20 }, happenings: [] });
  });

  test('a pointer that leaves the page is no pointer', () => {
    const { sensor } = sensorOnBody();
    pointer('pointermove', document, 10, 20);
    document.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null }));
    expect(sensor.readingOfFrame().position).toBeNull();
  });
});
