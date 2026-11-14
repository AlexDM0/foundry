/**
 * The sensors on a happy-dom page with stubbed boxes. What matters: every box, the pointer and the target element are in overlay units,
 * measured from the overlay's corner and divided by the size of one unit, so Flint is placed alike at half size and at full size; a
 * habitat narrower or lower than 100 pixels is not roomy, so Flint never goes into it, is never stored there and never drops there; the
 * copy target is read only for the habitat Flint lives in, at the centre of the element the host names, and an intent off the fixed list
 * gives none; and a drop lands on the innermost roomy habitat below the pointer, passing over a small one.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { SpriteHabitat }                    from './SpriteHabitat.ts';
import type { PerceptionRequest, SpriteSensors } from './SpriteSensors.ts';
import { createSpriteSensors }                   from './SpriteSensors.ts';
import type { PlaceBox }                         from './mind/Perception.ts';

const OVERLAY_LEFT_PIXELS = 10;
const OVERLAY_TOP_PIXELS = 20;

const sensorsMade: SpriteSensors[] = [];

afterEach(() => {
  for (const sensors of sensorsMade.splice(0)) sensors.destroy();
  document.body.replaceChildren();
});

function placeAt(element: Element, left: number, top: number, width: number, height: number): void {
  const rectangle = {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => rectangle as DOMRect;
}

function habitatOf(kind: string, changes: Partial<SpriteHabitat> = {}): SpriteHabitat {
  return {
    kind, description: `The ${kind}.`, suggestions: [], ...changes,
  };
}

interface Page {
  readonly sensors: SpriteSensors;
  readonly body:    HTMLElement;
  /** Registers a habitat element at a place in page pixels. */
  readonly habitat: (habitat: SpriteHabitat, left: number, top: number, width: number, height: number) => HTMLElement;
}

function page(pixelsForOneUnit: number): Page {
  const overlay = document.createElement('div');
  const home = document.createElement('div');
  const body = document.createElement('div');
  document.body.append(overlay, home, body);
  placeAt(overlay, OVERLAY_LEFT_PIXELS, OVERLAY_TOP_PIXELS, 1200, 800);
  placeAt(home, 1010, 720, 100, 60);
  const sensors = createSpriteSensors({
    document, overlay, bodyElement: body, home, pixelsForOneUnit, visitTarget: 'last-focused-or-clicked',
  });
  sensorsMade.push(sensors);
  return {
    sensors,
    body,
    habitat: (habitat, left, top, width, height) => {
      const element = document.createElement('section');
      document.body.append(element);
      placeAt(element, left, top, width, height);
      sensors.registerHabitat(element, habitat);
      return element;
    },
  };
}

const NO_REQUEST: PerceptionRequest = {
  copyTargetHabitatId: null, storedHabitatKind: null, reducedMotion: false, targetElement: null,
};

function pointer(type: string, target: EventTarget, clientX: number, clientY: number): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX, clientY,
  }));
}

describe('units', () => {
  test.each([0.5, 1])('at %p pixels for one unit, the home and a habitat are measured from the overlay corner in units', (pixelsForOneUnit) => {
    const { sensors, habitat } = page(pixelsForOneUnit);
    habitat(habitatOf('chat'), 210, 120, 400, 300);
    const perception = sensors.perceive(NO_REQUEST);
    const unitsOf = (pixels: number): number => pixels / pixelsForOneUnit;
    const expectedHome: PlaceBox = {
      leftX: unitsOf(1000), rightX: unitsOf(1100), topY: unitsOf(700), floorY: unitsOf(760),
    };
    expect(perception.home).toEqual(expectedHome);
    expect(perception.habitats[0]?.box).toEqual({
      leftX: unitsOf(200), rightX: unitsOf(600), topY: unitsOf(100), floorY: unitsOf(400),
    });
    expect(perception.stageWidthUnits).toBe(unitsOf(1200));
  });

  test('at half size, the pointer and the target element\'s box are in units too', () => {
    const { sensors, habitat } = page(0.5);
    const chat = habitat(habitatOf('chat'), 210, 120, 400, 300);
    const targetElement = document.createElement('button');
    document.body.appendChild(targetElement);
    placeAt(targetElement, 110, 220, 20, 40);
    pointer('pointermove', chat, 310, 220);
    const perception = sensors.perceive({ ...NO_REQUEST, targetElement });
    expect(perception.pointer).toEqual({ x: 600, y: 400, hasMoved: true });
    expect(perception.target).toEqual({
      kind: 'on-the-page',
      box:  {
        leftX: 200, rightX: 240, topY: 400, floorY: 480,
      },
    });
  });

  test('a target element that left the page is gone, and no element is none', () => {
    const { sensors } = page(1);
    const targetElement = document.createElement('button');
    document.body.appendChild(targetElement);
    targetElement.remove();
    expect(sensors.perceive({ ...NO_REQUEST, targetElement }).target).toEqual({ kind: 'gone' });
    expect(sensors.perceive(NO_REQUEST).target).toEqual({ kind: 'none' });
  });
});

describe('the minimum habitat size', () => {
  test('a habitat narrower or lower than 100 pixels is not roomy; one of exactly 100 by 100 is', () => {
    const { sensors, habitat } = page(1);
    habitat(habitatOf('narrow'), 10, 20, 99, 300);
    habitat(habitatOf('low'), 10, 20, 300, 99);
    habitat(habitatOf('square'), 10, 20, 100, 100);
    expect(sensors.perceive(NO_REQUEST).habitats.map((perceived) => [perceived.kind, perceived.isRoomy])).toEqual([
      ['narrow', false], ['low', false], ['square', true],
    ]);
  });

  test('the stored habitat is the roomy one of the stored kind; a small one of that kind is not stored', () => {
    const roomy = page(1);
    roomy.habitat(habitatOf('chat'), 210, 120, 400, 300);
    expect(roomy.sensors.perceive({ ...NO_REQUEST, storedHabitatKind: 'chat' }).storedHabitatId).not.toBeNull();
    document.body.replaceChildren();
    const small = page(1);
    small.habitat(habitatOf('chat'), 210, 120, 400, 60);
    expect(small.sensors.perceive({ ...NO_REQUEST, storedHabitatKind: 'chat' }).storedHabitatId).toBeNull();
  });

  test('a drop lands on the innermost roomy habitat below the pointer, passing over a small one, and off every habitat on none', () => {
    const { sensors, habitat, body } = page(1);
    habitat(habitatOf('outer'), 10, 20, 800, 600);
    habitat(habitatOf('inner'), 110, 120, 300, 300);
    habitat(habitatOf('small'), 610, 120, 80, 80);
    const dropAt = (clientX: number, clientY: number): unknown => {
      pointer('pointerdown', body, 0, 0);
      pointer('pointermove', document, clientX, clientY);
      pointer('pointerup', document, clientX, clientY);
      return sensors.perceive(NO_REQUEST).happenings.at(-1);
    };
    const kindOf = (habitatId: string | null): string | null => sensors.perceive(NO_REQUEST).habitats.find((perceived) => perceived.id === habitatId)?.kind ?? null;
    const onInner = dropAt(200, 200) as { readonly habitatId: string | null };
    expect(kindOf(onInner.habitatId)).toBe('inner');
    const onSmall = dropAt(650, 150) as { readonly habitatId: string | null };
    expect(kindOf(onSmall.habitatId)).toBe('outer');
    const offEverything = dropAt(1100, 700);
    expect(offEverything).toEqual({ kind: 'dropped', habitatId: null });
  });
});

describe('the copy target', () => {
  test('it is read only for the habitat Flint lives in, at the centre of the element the host names', () => {
    const { sensors, habitat } = page(0.5);
    const row = document.createElement('div');
    placeAt(row, 110, 200, 100, 20);
    habitat(habitatOf('agent-panel', { copyTargetFor: () => ({ element: row, intent: 'type' }) }), 10, 20, 800, 600);
    const habitatId = sensors.perceive(NO_REQUEST).habitats[0]?.id ?? null;
    expect(sensors.perceive(NO_REQUEST).habitats[0]?.copyTarget).toBeNull();
    expect(sensors.perceive({ ...NO_REQUEST, copyTargetHabitatId: habitatId }).habitats[0]?.copyTarget).toEqual({ centreX: 300, intent: 'type' });
  });

  test('an intent off the fixed list gives no copy target', () => {
    const { sensors, habitat } = page(1);
    const row = document.createElement('div');
    const copyTargetFor = () => ({ element: row, intent: 'dance' }) as unknown as ReturnType<NonNullable<SpriteHabitat['copyTargetFor']>>;
    habitat(habitatOf('agent-panel', { copyTargetFor }), 10, 20, 800, 600);
    const habitatId = sensors.perceive(NO_REQUEST).habitats[0]?.id ?? null;
    expect(sensors.perceive({ ...NO_REQUEST, copyTargetHabitatId: habitatId }).habitats[0]?.copyTarget).toBeNull();
  });
});
