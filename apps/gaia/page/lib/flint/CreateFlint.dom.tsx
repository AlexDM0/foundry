/**
 * `createFlint` in a happy-dom document on a manual frame source, with stubbed boxes: the overlay, the one Flint per document, what
 * `perform` and `steer` accept or refuse, dragging and dropping, hiding while unseen, the brain's turns, `destroy`, and a Flint that stays
 * in its box, which is drawn only inside it and ignores the pointer.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { FlintHandle, FlintOptions, FlintStorage } from './CreateFlint.ts';
import { createFlint, FlintRefusal }                    from './CreateFlint.ts';
import type {
  Director,
  PerceptionDigest,
  SpriteHabitat,
  SpriteIntent
} from './SpriteHabitat.ts';
import type { ManualFrameSource }  from './testing/ManualFrameSource.ts';
import { createManualFrameSource } from './testing/ManualFrameSource.ts';

const BODY_PATH = 'M0 -50 L20 -24 L0 0 L-20 -24Z';
const FRAME_MILLISECONDS = 16;
const CHAT_HABITAT: SpriteHabitat = { kind: 'chat', description: 'The conversation with the agent.', suggestions: [{ when: 'arrived', respond: 'wave' }] };
const SMALL_HABITAT: SpriteHabitat = { kind: 'badge', description: 'A small badge.', suggestions: [] };

const created: FlintHandle[] = [];
const restorers: (() => void)[] = [];

afterEach(() => {
  for (const handle of created.splice(0)) handle.destroy();
  for (const restore of restorers.splice(0)) restore();
  document.body.replaceChildren();
});

function placeAt(element: Element, left: number, top: number, width: number, height: number): void {
  const rectangle = {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => rectangle as DOMRect;
}

interface MadeFlint {
  readonly handle: FlintHandle;
  readonly frames: ManualFrameSource;
  readonly root:   HTMLElement;
  readonly home:   HTMLElement;
}

function madeFlint(options: Partial<FlintOptions> = {}): MadeFlint {
  const root = document.createElement('div');
  const home = document.createElement('div');
  root.appendChild(home);
  document.body.appendChild(root);
  const frames = createManualFrameSource();
  const handle = createFlint({
    root, home, frameSource: frames.frameSource, reducedMotion: () => false, ...options,
  });
  created.push(handle);
  return {
    handle, frames, root, home,
  };
}

/** A page of 1200 by 800 pixels: the home in the bottom right corner, and a chat and a small badge as habitats. */
function madeOnPage(options: Partial<FlintOptions> = {}): MadeFlint & { readonly chat: HTMLElement; readonly badge: HTMLElement } {
  const made = madeFlint(options);
  placeAt(overlayOf(made.root), 0, 0, 1200, 800);
  placeAt(made.home, 900, 600, 200, 100);
  const chat = document.createElement('section');
  const badge = document.createElement('span');
  made.root.append(chat, badge);
  placeAt(chat, 200, 200, 400, 300);
  placeAt(badge, 700, 200, 40, 40);
  made.handle.registerHabitat(chat, CHAT_HABITAT);
  made.handle.registerHabitat(badge, SMALL_HABITAT);
  return { ...made, chat, badge };
}

function overlayOf(root: HTMLElement): SVGSVGElement {
  const overlay = root.querySelector('svg[data-flint]');
  if (!(overlay instanceof SVGSVGElement)) throw new Error('no overlay in the root');
  return overlay;
}

function bodyOf(root: HTMLElement): Element {
  const body = overlayOf(root).querySelector(`path[d="${BODY_PATH}"][pointer-events]`);
  if (body === null) throw new Error('no body in the overlay');
  return body;
}

function figureTransformOf(root: HTMLElement): string | null {
  return overlayOf(root).querySelector(`path[d="${BODY_PATH}"][pointer-events]`)?.parentElement?.parentElement?.parentElement?.getAttribute('transform') ?? null;
}

function figurePositionOf(root: HTMLElement): { readonly x: number; readonly y: number } {
  const match = /^translate\((?<x>[-\d.]+) (?<y>[-\d.]+)\)$/u.exec(figureTransformOf(root) ?? '');
  return { x: Number(match?.groups?.['x']), y: Number(match?.groups?.['y']) };
}

/** The group that holds all of Flint, after the page's own group behind it. */
function occlusionOf(root: HTMLElement): string | null {
  return overlayOf(root).querySelector(':scope > g > g:not([data-flint-part])')?.getAttribute('clip-path') ?? null;
}

function advanceFor(frames: ManualFrameSource, milliseconds: number): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME_MILLISECONDS) frames.advance(FRAME_MILLISECONDS);
}

function pointer(type: string, target: EventTarget, clientX: number, clientY: number): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX, clientY,
  }));
}

function focusIn(element: Element): void {
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function recordingStorage(stored: string | null): FlintStorage & { readonly written: string[] } {
  const written: string[] = [];
  return { readHabitatKind: () => stored, writeHabitatKind: (value) => written.push(value), written };
}

describe('the overlay', () => {
  test('is mounted in the root, fixed over the page, above it and blind to the pointer', () => {
    const { root } = madeFlint();
    const { style } = overlayOf(root);
    expect([style.position, style.pointerEvents, style.width, style.height, style.zIndex]).toEqual(['fixed', 'none', '100%', '100%', '1000']);
  });

  test('draws at the given size', () => {
    const { root } = madeFlint({ pixelsForOneUnit: 0.5 });
    expect(overlayOf(root).querySelector(':scope > g')?.getAttribute('transform')).toBe('scale(0.5)');
  });

  test('takes the theme as custom properties', () => {
    const { root } = madeFlint({ theme: { body: 'var(--bridge-accent)', eye: '#000000' } });
    const { style } = overlayOf(root);
    expect([style.getPropertyValue('--flint-body'), style.getPropertyValue('--flint-eye')]).toEqual(['var(--bridge-accent)', '#000000']);
  });
});

describe('one Flint per document', () => {
  test('a second Flint on the same document is refused', () => {
    madeFlint();
    expect(() => madeFlint()).toThrow(FlintRefusal);
    expect(document.querySelectorAll('svg[data-flint]').length).toBe(1);
  });

  test('once the first is destroyed, a new Flint may be made', () => {
    const { handle } = madeFlint();
    handle.destroy();
    expect(() => madeFlint()).not.toThrow();
  });
});

describe('the frame loop', () => {
  test('nothing is drawn before the first frame, and each frame draws Flint on its home floor', () => {
    const { root, frames } = madeFlint();
    expect(figureTransformOf(root)).toBeNull();
    frames.advance(16);
    expect(figureTransformOf(root)).toMatch(/^translate\(0 -/);
  });

  test('Flint stands in the middle of its home, at the given size', () => {
    const { root, frames } = madeOnPage({ pixelsForOneUnit: 0.5 });
    frames.advance(16);
    expect(figurePositionOf(root).x).toBe(2000);
  });

  test('reduced motion holds the hover at its rest height', () => {
    const { root, frames } = madeFlint({ reducedMotion: () => true });
    for (let i = 0; i < 30; i++) frames.advance(50);
    expect(figureTransformOf(root)).toBe('translate(0 -6)');
  });

  test('destroy stops the frames, removes the overlay and unmarks the habitats', () => {
    const {
      handle, root, frames, chat
    } = madeOnPage();
    expect(chat.getAttribute('data-sprite-habitat')).toBe('chat');
    handle.destroy();
    expect(frames.isRunning()).toBe(false);
    expect(root.querySelector('svg[data-flint]')).toBeNull();
    expect(chat.hasAttribute('data-sprite-habitat')).toBe(false);
  });
});

describe('perform', () => {
  test('carries out an intent of the fixed list and refuses anything else', () => {
    const { handle } = madeFlint();
    expect(handle.perform('type-busy')).toBe('performed');
    expect(handle.perform('dance')).toBe('unknown-intent');
  });

  test('refuses after destroy', () => {
    const { handle } = madeFlint();
    handle.destroy();
    expect(handle.perform('wave')).toBe('destroyed');
  });

  test('a behaviour that must have an element is refused without one, and changes nothing', () => {
    const { handle, root, frames } = madeOnPage();
    frames.advance(16);
    expect(handle.perform('lay-bar-along')).toBe('needs-an-element');
    advanceFor(frames, 200);
    expect(figurePositionOf(root).x).toBe(1000);
  });

  test('a chase is refused while one runs; its bug is drawn on the page until the element it came from leaves the page', () => {
    const { handle, root, frames } = madeOnPage();
    const row = document.createElement('div');
    root.appendChild(row);
    placeAt(row, 920, 640, 160, 10);
    frames.advance(16);
    expect(handle.perform('chase-bug', row)).toBe('performed');
    expect(handle.perform('chase-bug', row)).toBe('already-running');
    advanceFor(frames, 100);
    expect(handle.perform('chase-bug')).toBe('already-running');
    const page = overlayOf(root).querySelector('g[data-flint-part="page"]');
    expect(page?.querySelector('polygon')?.getAttribute('fill')).toBe('var(--flint-alarm, #b7014d)');
    row.remove();
    advanceFor(frames, 400);
    expect(page?.getAttribute('display')).toBe('none');
    expect(handle.perform('chase-bug')).toBe('performed');
  });

  test('a bar given to the lay is walked to and risen to, from its box on the page', () => {
    const { handle, root, frames } = madeOnPage();
    const bar = document.createElement('div');
    root.appendChild(bar);
    placeAt(bar, 920, 640, 160, 10);
    frames.advance(16);
    expect(handle.perform('lay-bar-along', bar)).toBe('performed');
    advanceFor(frames, 2000);
    expect(figurePositionOf(root).y).toBeLessThan(650);
  });

  test('a visit goes to the habitat the user last focused, around its corner', () => {
    const {
      handle, root, frames, chat
    } = madeOnPage();
    frames.advance(16);
    focusIn(chat);
    handle.perform('visit');
    frames.advance(16);
    expect(occlusionOf(root)).toBe('url(#flint-occlusion)');
    expect(figurePositionOf(root).x).toBe(570);
  });
});

describe('attend', () => {
  test('an attendant of the list stays with Flint at the count given, held to its maximum; anything off the list is refused', () => {
    const { handle, root, frames } = madeOnPage();
    frames.advance(16);
    expect(handle.attend('watcher-spark', 9)).toBe('attended');
    advanceFor(frames, 300);
    const sparksOf = (): number => root.querySelectorAll('g[data-flint-part="watcher-spark"] rect[width="4"][height="4"][transform^="translate("]').length;
    expect(sparksOf()).toBe(4);
    handle.perform('type-angry');
    advanceFor(frames, 300);
    expect(sparksOf()).toBe(4);
    expect(handle.attend('moth', 1)).toBe('unknown-attendant');
    handle.destroy();
    expect(handle.attend('watcher-spark', 1)).toBe('destroyed');
  });
});

describe('steer', () => {
  test('a held walk moves Flint left along its floor until it stops walking; anything off the list is refused', () => {
    const { handle, root, frames } = madeOnPage();
    frames.advance(16);
    const startX = figurePositionOf(root).x;
    expect(handle.steer('walk-left')).toBe('steered');
    advanceFor(frames, 500);
    const walkedX = figurePositionOf(root).x;
    expect(walkedX).toBeLessThan(startX);
    handle.steer('stop-walking');
    frames.advance(16);
    const stoppedX = figurePositionOf(root).x;
    advanceFor(frames, 500);
    expect(Math.abs(figurePositionOf(root).x - stoppedX)).toBeLessThan(1);
    expect(handle.steer('dance')).toBe('unknown-steering');
    handle.destroy();
    expect(handle.steer('jump')).toBe('destroyed');
  });

  test('a grab given an element on Flint\'s left turns Flint to it', () => {
    const { handle, root, frames } = madeOnPage();
    const target = document.createElement('div');
    root.appendChild(target);
    placeAt(target, 940, 560, 12, 12);
    frames.advance(16);
    handle.perform('grab', target);
    frames.advance(16);
    expect(bodyOf(root).parentElement?.parentElement?.getAttribute('transform')).toBe('scale(-1 1)');
  });
});

describe('the pointer', () => {
  test('each habitat element carries its kind, for the host to style', () => {
    const { chat, badge } = madeOnPage();
    expect([chat.getAttribute('data-sprite-habitat'), badge.getAttribute('data-sprite-habitat')]).toEqual(['chat', 'badge']);
  });

  test('a press that moves less than the threshold is a click: Flint then plays with the pointer', () => {
    const { root, frames } = madeOnPage();
    frames.advance(16);
    pointer('pointerdown', bodyOf(root), 1000, 670);
    pointer('pointermove', document, 1003, 672);
    pointer('pointerup', document, 1003, 672);
    frames.advance(16);
    pointer('pointermove', document, 1090, 650);
    advanceFor(frames, 300);
    expect(figurePositionOf(root).x).toBeGreaterThan(1000);
  });

  test('a press that moves past the threshold carries Flint below the pointer, and marks the habitat below as the drop target', () => {
    const { root, frames, chat } = madeOnPage();
    frames.advance(16);
    pointer('pointerdown', bodyOf(root), 1000, 670);
    pointer('pointermove', document, 400, 300);
    frames.advance(16);
    const position = figurePositionOf(root);
    expect(Math.abs(position.x - 400)).toBeLessThan(2);
    expect(position.y).toBeCloseTo(352, 0);
    expect(chat.hasAttribute('data-sprite-drop-target')).toBe(true);
    pointer('pointermove', document, 100, 100);
    frames.advance(16);
    expect(chat.hasAttribute('data-sprite-drop-target')).toBe(false);
  });

  test('a drop on a habitat lands Flint on its bottom edge, and the habitat is stored', () => {
    const storage = recordingStorage(null);
    const { root, frames, chat } = madeOnPage({ storage });
    frames.advance(16);
    pointer('pointerdown', bodyOf(root), 1000, 670);
    pointer('pointermove', document, 400, 300);
    frames.advance(16);
    pointer('pointerup', document, 400, 300);
    advanceFor(frames, 2500);
    expect(chat.hasAttribute('data-sprite-drop-target')).toBe(false);
    expect(storage.written).toEqual(['1:chat']);
    expect(figurePositionOf(root).y).toBeGreaterThan(500 - 10);
  });

  test('a habitat smaller than 50 by 50 pixels is never the drop target: a drop there strands Flint, which goes home', () => {
    const storage = recordingStorage(null);
    const { root, frames, badge } = madeOnPage({ storage });
    frames.advance(16);
    pointer('pointerdown', bodyOf(root), 1000, 670);
    pointer('pointermove', document, 720, 220);
    frames.advance(16);
    expect(badge.hasAttribute('data-sprite-drop-target')).toBe(false);
    pointer('pointerup', document, 720, 220);
    advanceFor(frames, 2000);
    expect(storage.written).toEqual([]);
    expect(Math.abs(figurePositionOf(root).y - 694)).toBeLessThan(4);
  });

  test('a habitat smaller than 50 by 50 pixels is never visited, nor taken from storage', () => {
    const {
      handle, root, frames, badge
    } = madeOnPage({ storage: recordingStorage('1:badge') });
    frames.advance(16);
    focusIn(badge);
    handle.perform('visit');
    advanceFor(frames, 100);
    expect([occlusionOf(root), figurePositionOf(root).x]).toEqual([null, 1000]);
  });
});

describe('the stored habitat', () => {
  test('Flint starts in the habitat the storage remembers', () => {
    const { root, frames } = madeOnPage({ storage: recordingStorage('1:chat') });
    frames.advance(16);
    expect(figurePositionOf(root).x).toBe(400);
  });

  test('the handle tells the kind of the habitat Flint lives in: none at home, the stored one once Flint is in it, none after destroy', () => {
    const atHome = madeOnPage();
    atHome.frames.advance(16);
    expect(atHome.handle.livesIn()).toBeNull();
    atHome.handle.destroy();
    const inChat = madeOnPage({ storage: recordingStorage('1:chat') });
    inChat.frames.advance(16);
    expect(inChat.handle.livesIn()).toBe('chat');
    inChat.handle.destroy();
    expect(inChat.handle.livesIn()).toBeNull();
  });
});

describe('stopping', () => {
  test('Flint draws nothing while the tab is hidden, and goes on once it shows', () => {
    const { root, frames } = madeOnPage();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    restorers.push(() => Reflect.deleteProperty(document, 'visibilityState'));
    advanceFor(frames, 100);
    expect(figureTransformOf(root)).toBeNull();
    Reflect.deleteProperty(document, 'visibilityState');
    frames.advance(16);
    expect(figureTransformOf(root)).not.toBeNull();
  });

  /** Replaces the page's IntersectionObserver with one the spec answers, and gives the function that reports a target's visibility. */
  function reportedIntersections(): (target: Element, isIntersecting: boolean) => void {
    const view = document.defaultView;
    if (view === null) throw new Error('no window');
    const observed: ((entries: { target: Element; isIntersecting: boolean }[]) => void)[] = [];
    const original = view.IntersectionObserver;
    class RecordingIntersectionObserver {
      public constructor(callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
        observed.push(callback);
      }

      public observe(): void {}

      public unobserve(): void {}

      public disconnect(): void {}
    }
    Object.defineProperty(view, 'IntersectionObserver', { value: RecordingIntersectionObserver, configurable: true, writable: true });
    restorers.push(() => Object.defineProperty(view, 'IntersectionObserver', { value: original, configurable: true, writable: true }));
    return (target, isIntersecting) => {
      for (const callback of observed) callback([{ target, isIntersecting }]);
    };
  }

  test('Flint stops, hidden and so not pressable, while the habitat it lives in is off the screen, and shows again when it is back', () => {
    const report = reportedIntersections();
    const { root, frames, chat } = madeOnPage({ storage: recordingStorage('1:chat') });
    frames.advance(16);
    report(chat, false);
    const stopped = figureTransformOf(root);
    advanceFor(frames, 500);
    expect(figureTransformOf(root)).toBe(stopped);
    expect(overlayOf(root).style.visibility).toBe('hidden');
    report(chat, true);
    advanceFor(frames, 500);
    expect(figureTransformOf(root)).not.toBe(stopped);
    expect(overlayOf(root).style.visibility).toBe('');
  });

  test('a habitat that has no box any more, such as one set to display none, does not stop Flint: it sends Flint home', () => {
    const report = reportedIntersections();
    const {
      root, frames, chat, handle
    } = madeOnPage({ storage: recordingStorage('1:chat') });
    advanceFor(frames, 500);
    expect(handle.livesIn()).toBe('chat');
    placeAt(chat, 0, 0, 0, 0);
    chat.getClientRects = () => ({ length: 0 }) as DOMRectList;
    report(chat, false);
    advanceFor(frames, 500);
    expect(handle.livesIn()).toBeNull();
    expect(overlayOf(root).style.visibility).toBe('');
  });
});

describe('the brain', () => {
  function recordingBrain(answer: (digest: PerceptionDigest) => SpriteIntent | Promise<SpriteIntent>): Director & { readonly digests: PerceptionDigest[] } {
    const digests: PerceptionDigest[] = [];
    return {
      nextIntent: (digest) => {
        digests.push(digest);
        return answer(digest);
      },
      digests,
    };
  }

  test('a brain is asked in place of the rule director until its maximum time ends', () => {
    const { handle, frames } = madeOnPage();
    const brain = recordingBrain(() => 'wander');
    frames.advance(16);
    handle.startBrain(brain, 7000);
    advanceFor(frames, 6500);
    expect(brain.digests.length).toBe(2);
    advanceFor(frames, 6000);
    expect(brain.digests.length).toBe(2);
  });

  test('stopBrain hands the director back at once', () => {
    const { handle, frames } = madeOnPage();
    const brain = recordingBrain(() => 'wander');
    handle.startBrain(brain, 60000);
    handle.stopBrain();
    advanceFor(frames, 7000);
    expect(brain.digests).toEqual([]);
  });

  test('a brain is never asked while Flint sleeps', () => {
    const { handle, frames } = madeOnPage();
    const brain = recordingBrain(() => 'sleep');
    frames.advance(16);
    handle.perform('sleep');
    handle.startBrain(brain, 60000);
    advanceFor(frames, 7000);
    expect(brain.digests).toEqual([]);
  });

  test('while a brain thinks, it is not asked again', () => {
    const { handle, frames } = madeOnPage();
    const brain = recordingBrain(() => new Promise<SpriteIntent>(() => undefined));
    handle.startBrain(brain, 60000);
    advanceFor(frames, 10000);
    expect(brain.digests.length).toBe(1);
  });

  test('an answer off the list is refused, and the rule director answers that time: Flint visits the focused habitat', () => {
    const {
      handle, frames, root, chat
    } = madeOnPage();
    frames.advance(16);
    focusIn(chat);
    handle.startBrain(recordingBrain(() => 'dance' as SpriteIntent), 60000);
    advanceFor(frames, 3100);
    expect(occlusionOf(root)).toBe('url(#flint-occlusion)');
  });

  test('the digest tells the brain where Flint lives and the habitat\'s content', () => {
    const contentHabitat: SpriteHabitat = { ...CHAT_HABITAT, contentFor: () => ({ facts: { agentsRunning: 2 } }) };
    const { handle, frames, chat } = madeOnPage({ storage: recordingStorage('1:chat') });
    handle.registerHabitat(chat, contentHabitat);
    const brain = recordingBrain(() => 'wander');
    handle.startBrain(brain, 60000);
    advanceFor(frames, 3100);
    expect(brain.digests[0]).toMatchObject({ habitatKind: 'chat', content: { facts: { agentsRunning: 2 } }, isAsleep: false });
  });
});

describe('a Flint that stays in its box', () => {
  const STAYS_IN_ITS_BOX: Partial<FlintOptions> = { confinement: 'stays-in-its-box' };

  /** The clip on the scaled group that holds all of Flint, its x, y, width and height in overlay units; null when there is none. */
  function confinementOf(root: HTMLElement): readonly (string | null)[] | null {
    const scaled = overlayOf(root).querySelector(':scope > g');
    if (scaled?.getAttribute('clip-path') !== 'url(#flint-confinement)') return null;
    const rectangle = overlayOf(root).querySelector('#flint-confinement rect');
    return ['x', 'y', 'width', 'height'].map((name) => rectangle?.getAttribute(name) ?? null);
  }

  test('is drawn only inside its home\'s box, which follows the box at a new window size; a Flint that roams is not clipped', () => {
    const { root, frames, home } = madeOnPage(STAYS_IN_ITS_BOX);
    frames.advance(16);
    expect(confinementOf(root)).toEqual(['900', '600', '200', '100']);
    placeAt(home, 700, 500, 150, 80);
    frames.advance(16);
    expect(confinementOf(root)).toEqual(['700', '500', '150', '80']);
    created.splice(0).forEach((handle) => handle.destroy());
    const roaming = madeOnPage();
    roaming.frames.advance(16);
    expect(confinementOf(roaming.root)).toBeNull();
  });

  test('the pointer changes nothing: the body is blind to it, a drag carries nothing and a click starts no play', () => {
    const positionsOf = (pressesAndMoves: boolean): readonly { readonly x: number; readonly y: number }[] => {
      const { root, frames, chat } = madeOnPage(STAYS_IN_ITS_BOX);
      frames.advance(16);
      expect(bodyOf(root).getAttribute('pointer-events')).toBe('none');
      if (pressesAndMoves) {
        pointer('pointerdown', bodyOf(root), 1000, 670);
        pointer('pointermove', document, 400, 300);
      }
      frames.advance(16);
      expect(chat.hasAttribute('data-sprite-drop-target')).toBe(false);
      if (pressesAndMoves) {
        pointer('pointerup', document, 400, 300);
        pointer('pointerdown', bodyOf(root), 1000, 670);
        pointer('pointerup', document, 1000, 670);
        pointer('pointermove', document, 1090, 650);
      }
      const positions = [figurePositionOf(root)];
      for (let i = 0; i < 10; i++) {
        advanceFor(frames, 300);
        positions.push(figurePositionOf(root));
      }
      created.splice(0).forEach((handle) => handle.destroy());
      return positions;
    };
    expect(positionsOf(true)).toEqual(positionsOf(false));
  });

  test('a visit pops in through an edge and is drawn only inside the habitat\'s box', () => {
    const {
      handle, root, frames, chat
    } = madeOnPage(STAYS_IN_ITS_BOX);
    frames.advance(16);
    focusIn(chat);
    handle.perform('visit');
    frames.advance(16);
    expect(confinementOf(root)).toEqual(['200', '200', '400', '300']);
    advanceFor(frames, 7000);
    expect(handle.livesIn()).toBe('chat');
    const { x } = figurePositionOf(root);
    expect(x > 200 && x < 600).toBe(true);
  });

  test('takes only an element inside the box it lives in; an element outside is refused and changes nothing', () => {
    const { handle, frames, home } = madeOnPage(STAYS_IN_ITS_BOX);
    const outsideBar = document.createElement('div');
    document.body.appendChild(outsideBar);
    placeAt(outsideBar, 300, 300, 160, 10);
    const insideBar = document.createElement('div');
    home.appendChild(insideBar);
    placeAt(insideBar, 920, 640, 160, 10);
    frames.advance(16);
    expect(handle.perform('lay-bar-along', outsideBar)).toBe('outside-its-box');
    expect(handle.perform('grab', outsideBar)).toBe('outside-its-box');
    expect(handle.perform('grab')).toBe('performed');
    expect(handle.perform('lay-bar-along', insideBar)).toBe('performed');
  });

  test('only the cues of the box it lives in end its quiet', () => {
    const quietWhenAskedOf = (options: Partial<FlintOptions>): number | undefined => {
      const { handle, frames, chat } = madeOnPage(options);
      const digests: PerceptionDigest[] = [];
      frames.advance(16);
      handle.startBrain({
        nextIntent: (digest) => {
          digests.push(digest);
          return 'wander';
        },
      }, 60000);
      advanceFor(frames, 2000);
      handle.cue(chat, 'agent-is-writing');
      advanceFor(frames, 1100);
      created.splice(0).forEach((made) => made.destroy());
      return digests[0]?.quietMilliseconds;
    };
    expect(quietWhenAskedOf(STAYS_IN_ITS_BOX)).toBeGreaterThan(2000);
    expect(quietWhenAskedOf({})).toBeLessThan(2000);
  });
});
