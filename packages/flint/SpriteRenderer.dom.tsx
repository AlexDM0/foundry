/**
 * The renderer in a happy-dom document. What matters: it draws every part of `01-character.md` in its layer order; Flint is hidden from
 * assistive technology and only its body takes the pointer; every colour is a `--flint-*` property with its default; the pose mirrors with
 * the facing but the marks, the ticks and the direction of writing do not; the sideways pose keeps the eyes and hands in shape; a prop
 * slides in with its level; the body's tint and dashed outline follow their channels; an attendant is drawn behind Flint with its x
 * mirrored; a behaviour's page shapes are drawn behind all of Flint where the page puts them, never moved with Flint or mirrored, and are
 * hidden when none is given; the size follows `pixelsForOneUnit`; a body told to take no pointer is blind to it; and a confinement holds all
 * of the drawing, the page shapes too, inside its box, shows nothing for nowhere, and is lifted for everywhere. A part is found in the group
 * named after it, since shared builders draw alike.
 */
import { describe, expect, test } from 'bun:test';

import type { HandPose, Pose }           from './SpritePose.ts';
import { NEUTRAL_POSE, emoteMarkAtRest } from './SpritePose.ts';
import { createSpriteRenderer }          from './SpriteRenderer.ts';
import type { PropsPose }                from './props/PropCatalog.ts';

const BODY_PATH = 'M0 -50 L20 -24 L0 0 L-20 -24Z';

function drawn(pose: Pose, pixelsForOneUnit = 1, bodyTakesPointer = true): SVGSVGElement {
  const renderer = createSpriteRenderer({ document, pixelsForOneUnit, bodyTakesPointer });
  renderer.draw(pose);
  return renderer.element;
}

function posed(changes: { readonly body?: Partial<Pose['body']>; readonly props?: Partial<PropsPose> } & Partial<Omit<Pose, 'body' | 'props'>>): Pose {
  return {
    ...NEUTRAL_POSE, ...changes, body: { ...NEUTRAL_POSE.body, ...changes.body }, props: { ...NEUTRAL_POSE.props, ...changes.props },
  };
}

function everyElementOf(svg: SVGSVGElement): readonly Element[] {
  return [...svg.querySelectorAll('*')];
}

function onlyElement(svg: SVGSVGElement, selector: string): Element {
  const matches = svg.querySelectorAll(selector);
  expect(matches.length, selector).toBe(1);
  const [element] = matches;
  if (element === undefined) throw new Error(`no element matches ${selector}`);
  return element;
}

/**
 * The one element of the selector in the group of the named prop or mark, or, for null, outside every part's group: every prop's hidden
 * state is drawn at the start, and the shared builders draw alike in several props.
 */
function onlyElementOf(svg: SVGSVGElement, partName: string | null, selector: string): Element {
  const matches = partName === null
    ? [...svg.querySelectorAll(selector)].filter((element) => element.closest('[data-flint-part]') === null)
    : [...svg.querySelectorAll(`g[data-flint-part="${partName}"] ${selector}`)];
  expect(matches.length, `${partName ?? 'the body'}: ${selector}`).toBe(1);
  const [element] = matches;
  if (element === undefined) throw new Error(`no element matches ${selector}`);
  return element;
}

/** The body path that takes the pointer; the tint draws the same path again on top of it. */
function bodyOf(svg: SVGSVGElement): Element {
  return onlyElement(svg, `path[d="${BODY_PATH}"][pointer-events]`);
}

/** The group that mirrors: the parent of the body's group. */
function flipOf(svg: SVGSVGElement): Element {
  const flip = bodyOf(svg).parentElement?.parentElement;
  if (flip === null || flip === undefined) throw new Error('the body has no mirrored group');
  return flip;
}

const SQUARE_HAND: HandPose = {
  cornerCount: 4, centreX: 22, centreY: -10, radius: 6, turnDegrees: 45, placement: 'eased',
};

describe('the overlay', () => {
  test('is hidden from assistive technology, marked as Flint\'s, and lets only the body take the pointer', () => {
    const svg = drawn(NEUTRAL_POSE);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.hasAttribute('data-flint')).toBe(true);
    const takingThePointer = everyElementOf(svg).filter((element) => element.hasAttribute('pointer-events'));
    expect(takingThePointer).toEqual([bodyOf(svg)]);
    expect(bodyOf(svg).getAttribute('pointer-events')).toBe('visiblePainted');
  });

  test('every colour is a --flint-* custom property with its default, or a gradient of them', () => {
    const svg = drawn(NEUTRAL_POSE);
    const colours = everyElementOf(svg).flatMap((element) => ['fill', 'stroke', 'stop-color'].flatMap((name) => element.getAttribute(name) ?? []));
    expect(colours.length).toBeGreaterThan(40);
    expect(colours.filter((colour) => !/^var\(--flint-[a-z-]+, #[0-9a-f]{6}\)$/.test(colour) && colour !== 'none' && !/^url\(#flint-[a-z-]+\)$/.test(colour))).toEqual([]);
    expect(bodyOf(svg).getAttribute('fill')).toBe('var(--flint-body, #fa5f01)');
  });

  test('scales Flint by pixelsForOneUnit', () => {
    const svg = drawn(NEUTRAL_POSE, 0.5);
    expect(svg.querySelector(':scope > g')?.getAttribute('transform')).toBe('scale(0.5)');
  });
});

describe('the still pose', () => {
  test('the neutral pose draws the body and both eyes as in flint-neutral.svg', () => {
    const svg = drawn(NEUTRAL_POSE);
    const eyes = [...svg.querySelectorAll('rect[fill="var(--flint-eye, #181818)"]')];
    expect(eyes.map((eye) => ['x', 'y', 'width', 'height'].map((name) => eye.getAttribute(name)))).toEqual([['-5', '-28', '4', '8'], ['5', '-28', '4', '8']]);
  });

  test('Flint stands on its floor, raised by the hover, the jump and the lift, and moved by the shake', () => {
    const svg = drawn(posed({
      body: {
        positionX: 200, floorY: 400, hover: 6, jumpHeight: 30, lift: 2, shake: 1.5,
      },
    }));
    expect(flipOf(svg).parentElement?.getAttribute('transform')).toBe('translate(201.5 362)');
  });

  test('every part is drawn in the layer order of the character sheet', () => {
    const svg = drawn(posed({
      props:    { lookingGlass: { shown: 1, centreX: 38, centreY: -30 } },
      nearHand: {
        cornerCount: 5, centreX: 30, centreY: -22, radius: 5, turnDegrees: 0, placement: { heldTo: 'lookingGlass' },
      },
    }));
    const order = everyElementOf(svg);
    const indexOf = ([partName, selector]: readonly [string | null, string]): number => order.indexOf(onlyElementOf(svg, partName, selector));
    const hands = [...svg.querySelectorAll('polygon[fill="var(--flint-hand, #e24f00)"]')].filter((hand) => !hand.hasAttribute('stroke'));
    expect(hands.length).toBe(2);
    const layers = [
      ['keyboard', 'rect[x="14"][y="-4"]'],
      ['bolt', 'rect[x="34"][y="-26"]'],
      ['sheet', 'polygon[fill="var(--flint-paper-stacked, #f3f3f3)"][transform^="translate(4.2"]'],
      ['mergeBlocks', 'rect[fill="var(--flint-done, #3d9c5e)"][y="-34"]'],
      ['book', 'polygon[points="27,-41 39,-37.5 51,-41 51,-16.5 39,-13 27,-16.5"]'],
      ['notepad', 'polygon[points="30,-42 46,-38.8 46,-14.8 30,-18"]'],
      ['searchBar', 'rect[x="26"][y="-47"]'],
      ['hologram', 'rect[x="32"][y="-48"]'],
      ['ticket', 'polygon[points="29,-44.8 47,-41.2 47,-37.6 29,-41.2"]'],
      [null, `path[d="${BODY_PATH}"][pointer-events]`],
      [null, 'path[d="M0 -38 L11 -24 L0 -11 L-11 -24Z"]'],
      [null, 'path[d="M-6 -22 q2.5 -6 5 0 M4 -22 q2.5 -6 5 0"]'],
      ['lookingGlass', 'line[stroke-width="2.4"]'],
      ['lookingGlass', 'circle[r="5.5"]'],
    ] as const;
    const indices = [order.indexOf(hands[0] ?? svg), ...layers.map(indexOf), order.indexOf(hands[1] ?? svg)];
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  test('a hand is a regular polygon around its centre, first corner up at a turn of 0, and nothing at radius 0', () => {
    const svg = drawn(posed({ nearHand: { ...SQUARE_HAND, turnDegrees: 0 }, farHand: { ...SQUARE_HAND, radius: 0 } }));
    const hands = [...svg.querySelectorAll('polygon[fill="var(--flint-hand, #e24f00)"]')].filter((hand) => !hand.hasAttribute('stroke'));
    expect(hands.map((hand) => hand.getAttribute('points'))).toEqual(['', '22,-16 28,-10 22,-4 16,-10']);
  });

  test.each([
    ['keyboard', { keyboard: { shown: 1, drop: 0 } }, 'rect[x="14"][y="-4"]'],
    ['bolt', { bolt: { shown: 1 } }, 'rect[x="34"][y="-26"]'],
    ['ticket', {
      ticket: {
        shown: 1, cycleOpacity: 1, writtenLengths: [12, 12, 12], sealShown: true, offsetX: 0, offsetY: 0,
      },
    }, 'polygon[points="29,-44.8 47,-41.2 47,-37.6 29,-41.2"]'],
    ['book', { book: { shown: 1, turningPageSpread: null } }, 'polygon[points="27,-41 39,-37.5 51,-41 51,-16.5 39,-13 27,-16.5"]'],
    ['notepad', { notepad: { shown: 1, writtenLengths: [10, 10, 10] } }, 'polygon[points="30,-42 46,-38.8 46,-14.8 30,-18"]'],
    ['searchBar', { searchBar: { shown: 1, queryLength: 14 } }, 'rect[x="26"][y="-47"]'],
    ['hologram', { hologram: { shown: 1, flicker: 1, scanLineY: -47 } }, 'rect[x="32"][y="-48"]'],
  ] satisfies readonly (readonly [string, Partial<PropsPose>, string])[])('the %s shows fully at a shown level of 1', (propName, props, selector) => {
    const svg = drawn(posed({ props }));
    const part = onlyElementOf(svg, propName, selector);
    const holder = part.parentElement?.tagName === 'g' && part.parentElement !== flipOf(svg) ? part.parentElement : part;
    expect(holder.getAttribute('opacity')).toBe('1');
  });

  test('the keyboard, the bolt and the sheet slide in with their level: 5 up, 8 and 6 from the side away from Flint', () => {
    const svg = drawn(posed({ props: { keyboard: { shown: 0.5, drop: 0 }, bolt: { shown: 0.5 }, sheet: { ...NEUTRAL_POSE.props.sheet, shown: 0.5 }, }, }));
    expect(onlyElement(svg, 'rect[x="14"][y="-4"]').parentElement?.getAttribute('transform')).toBe('translate(0 2.5)');
    expect(onlyElement(svg, 'rect[x="34"][y="-26"]').getAttribute('transform')).toBe('translate(4 0)');
    expect(svg.querySelector('g[data-flint-part="sheet"] polygon[fill="var(--flint-paper-stacked, #f3f3f3)"]')?.parentElement?.getAttribute('transform')).toBe('translate(3 0)');
  });

  test('the sheet shows its stacked pages, the line read in the body colour, and its verdict', () => {
    const svg = drawn(posed({
      props: {
        sheet: {
          shown: 1, readLineIndex: 2, stackedPageCount: 3, offsetY: 0, verdict: 'tick',
        },
      },
    }));
    const pages = [...svg.querySelectorAll('g[data-flint-part="sheet"] polygon[fill="var(--flint-paper-stacked, #f3f3f3)"]')];
    expect(pages.map((page) => page.getAttribute('opacity'))).toEqual(['1', '1', '1']);
    expect(pages.map((page) => page.getAttribute('transform'))).toEqual([
      'translate(4.2 2.4) rotate(4 38 -28)', 'translate(1.9 2.6) rotate(-3 38 -28)', 'translate(1.8 0.6) rotate(2.5 38 -28)',
    ]);
    const lines = [...svg.querySelectorAll('g[data-flint-part="sheet"] path[stroke-width="1.5"][d^="M31 "]')];
    expect(lines.map((line) => line.getAttribute('stroke'))).toEqual([
      'var(--flint-paper-text, #b5b5b5)', 'var(--flint-paper-text, #b5b5b5)', 'var(--flint-body, #fa5f01)', 'var(--flint-paper-text, #b5b5b5)',
    ]);
    expect(onlyElementOf(svg, 'sheet', 'path[d="M40 -52 l3 3 l6 -7"]').getAttribute('opacity')).toBe('1');
  });

  test('the turning page of the book runs from the spine to its edge at k', () => {
    const svg = drawn(posed({ props: { book: { shown: 1, turningPageSpread: 0 } } }));
    const page = onlyElement(svg, 'polygon[stroke-width="0.8"]');
    expect(page.getAttribute('points')).toBe('39,-38.5 39,-44.5 39,-21.5 39,-15.5');
    expect(page.getAttribute('opacity')).toBe('1');
  });

  test('the handle of the looking glass runs from the lens edge to the hand that holds it', () => {
    const svg = drawn(posed({
      props:    { sheet: { ...NEUTRAL_POSE.props.sheet, shown: 1 }, lookingGlass: { shown: 1, centreX: 38, centreY: -30 } },
      nearHand: {
        cornerCount: 5, centreX: 30, centreY: -22, radius: 5, turnDegrees: 0, placement: { heldTo: 'lookingGlass' },
      },
    }));
    const handle = onlyElementOf(svg, 'lookingGlass', 'line[stroke-width="2.4"]');
    expect(['x1', 'y1', 'x2', 'y2', 'opacity'].map((name) => handle.getAttribute(name))).toEqual(['34.11', '-26.11', '30', '-22', '1']);
    expect(onlyElementOf(svg, 'lookingGlass', 'circle[r="5.5"]').getAttribute('transform')).toBe('translate(38 -30) scale(1 1)');
  });

  test('the glow of sleep shows with its opacity', () => {
    const svg = drawn(posed({ sleep: { glowOpacity: 0.4, embers: [] } }));
    expect(onlyElement(svg, 'path[d="M0 -38 L11 -24 L0 -11 L-11 -24Z"]').getAttribute('opacity')).toBe('0.4');
  });
});

describe('facing left', () => {
  const facingLeft = (changes: Parameters<typeof posed>[0]): Pose => posed({ ...changes, body: { ...changes.body, facing: -1 } });

  test('the pose mirrors', () => {
    expect(flipOf(drawn(facingLeft({}))).getAttribute('transform')).toBe('scale(-1 1)');
  });

  test('an emote mark keeps its reading direction and moves its anchor to the side Flint faces', () => {
    const svg = drawn(facingLeft({ emoteMark: emoteMarkAtRest('question') }));
    const question = [...svg.querySelectorAll('g[data-flint-part="question"] text')].find((text) => text.textContent === '?');
    const markGroup = question?.parentElement;
    expect(markGroup?.getAttribute('transform')).toBe('translate(-20 -54) scale(1.5 1.5) scale(1 1)');
    expect(flipOf(svg).contains(question ?? null)).toBe(false);
    expect(markGroup?.getAttribute('display')).toBe('inline');
  });

  test('only the mark of the pose shows', () => {
    const svg = drawn(posed({ emoteMark: emoteMarkAtRest('greeting') }));
    const shownTexts = [...svg.querySelectorAll('text')].filter((text) => text.parentElement?.getAttribute('display') === 'inline').map((text) => text.textContent);
    expect(shownTexts).toEqual(['Hi!']);
  });

  test('a tick is mirrored back about its own centre', () => {
    const svg = drawn(facingLeft({ props: { sheet: { ...NEUTRAL_POSE.props.sheet, shown: 1 }, mergeBlocks: { ...NEUTRAL_POSE.props.mergeBlocks, shown: 1 } } }));
    expect(onlyElementOf(svg, 'sheet', 'path[d="M40 -52 l3 3 l6 -7"]').getAttribute('transform')).toBe('translate(89 0) scale(-1 1)');
    expect(onlyElementOf(svg, 'mergeBlocks', 'path[d="M45 -27 l3 3 l6 -7"]').getAttribute('transform')).toBe('translate(99 0) scale(-1 1)');
  });

  test('a written line starts at its left end on the screen and grows to the right', () => {
    const halfWritten = {
      ticket: {
        shown: 1, cycleOpacity: 1, writtenLengths: [6, 0, 0], sealShown: false, offsetX: 0, offsetY: 0,
      },
    };
    const lineOf = (svg: SVGSVGElement): readonly (string | null)[] => {
      const line = svg.querySelector('g[data-flint-part="ticket"] line[stroke-width="1.5"][y1="-34"], g[data-flint-part="ticket"] line[stroke-width="1.5"][y1="-31.6"]');
      return ['x1', 'y1', 'x2', 'y2'].map((name) => line?.getAttribute(name) ?? null);
    };
    expect(lineOf(drawn(posed({ props: halfWritten })))).toEqual(['31', '-34', '37', '-32.8']);
    expect(lineOf(drawn(facingLeft({ props: halfWritten })))).toEqual(['43', '-31.6', '37', '-32.8']);
  });

  test('the search query starts at its left end on the screen', () => {
    const svg = drawn(facingLeft({ props: { searchBar: { shown: 1, queryLength: 7 } } }));
    const query = onlyElement(svg, 'line[y1="-43"]');
    expect([query.getAttribute('x1'), query.getAttribute('x2')]).toEqual(['49.5', '42.5']);
  });

  test('the embers do not mirror and do not shake', () => {
    const svg = drawn(facingLeft({
      body: {
        positionX: 100, floorY: 0, hover: 0, shake: 3
      },
      sleep: {
        glowOpacity: 0,
        embers:      [{
          x: 4, y: -44, turnDegrees: 45, opacity: 0.5
        }]
      },
    }));
    const ember = onlyElement(svg, 'rect[width="5"][height="5"]');
    expect(ember.getAttribute('transform')).toBe('translate(104 -44) rotate(45)');
    expect(flipOf(svg).contains(ember)).toBe(false);
  });
});

describe('the sideways pose', () => {
  test('narrows the body but keeps both eyes at their drawn width, moved 2 more to the side Flint faces', () => {
    const svg = drawn(posed({ body: { sidewaysWidth: 0.8 } }));
    expect(flipOf(svg).getAttribute('transform')).toBe('scale(0.8 1)');
    const eyes = [...svg.querySelectorAll('rect[fill="var(--flint-eye, #181818)"]')];
    expect(eyes.map((eye) => [eye.getAttribute('x'), eye.getAttribute('width')])).toEqual([['-3.75', '5'], ['8.75', '5']]);
  });

  test('a hand keeps its shape: each corner\'s offset is divided by the width', () => {
    const svg = drawn(posed({ body: { sidewaysWidth: 0.8 }, nearHand: { ...SQUARE_HAND, turnDegrees: 0 } }));
    const hands = [...svg.querySelectorAll('polygon[fill="var(--flint-hand, #e24f00)"]')].filter((hand) => !hand.hasAttribute('stroke'));
    expect(hands[1]?.getAttribute('points')).toBe('22,-16 29.5,-10 22,-4 14.5,-10');
  });
});

describe('occlusion', () => {
  test('a component edge drawn in front of Flint clips the side it hides', () => {
    const svg = drawn(posed({ occlusion: { edgeX: 250, hiddenSide: 1 } }));
    const clip = onlyElement(svg, '#flint-occlusion rect');
    expect([clip.getAttribute('x'), clip.getAttribute('width')]).toEqual(['-99750', '100000']);
    expect(svg.querySelector('[clip-path="url(#flint-occlusion)"]')).not.toBeNull();
    expect(drawn(NEUTRAL_POSE).querySelector('[clip-path]')).toBeNull();
  });
});

describe('the new channels of the body', () => {
  test('a tint draws the body again on top of itself in its colour, with the amount as its opacity, and no tint draws nothing', () => {
    const tinted = drawn(posed({ body: { tint: { role: 'alarm', amount: 0.6 } } }));
    const bodies = [...tinted.querySelectorAll(`path[d="${BODY_PATH}"]`)].filter((body) => body.closest('[data-flint-part]') === null);
    expect(bodies.map((body) => [body.getAttribute('fill'), body.getAttribute('opacity'), body.getAttribute('display')])).toEqual([
      ['var(--flint-body, #fa5f01)', null, null], ['var(--flint-alarm, #b7014d)', '0.6', 'inline'],
    ]);
    expect(drawn(NEUTRAL_POSE).querySelectorAll(`path[d="${BODY_PATH}"][display="inline"]`).length).toBe(0);
  });

  test('a fill below 1 shows the dashed outline with the opposite opacity; a full fill has no outline', () => {
    const fading = bodyOf(drawn(posed({ body: { fillOpacity: 0.3 } })));
    expect(['fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity'].map((name) => fading.getAttribute(name))).toEqual([
      '0.3', 'var(--flint-body, #fa5f01)', '1.5', '3 2', '0.7',
    ]);
    expect(bodyOf(drawn(NEUTRAL_POSE)).hasAttribute('stroke')).toBe(false);
  });
});

describe('the attendants', () => {
  test('a member is drawn behind Flint at its feet, its x mirrored with the facing, turned and scaled around its own centre', () => {
    const member = {
      name: 'watcher-spark', index: 0, x: -26, y: -44, turnDegrees: 45, scale: 1,
    } as const;
    const svg = drawn(posed({
      body: {
        positionX: 100, floorY: 200, hover: 0, facing: -1
      },
      attendants: [member]
    }));
    const spark = onlyElement(svg, 'rect[width="4"][height="4"][transform^="translate(26 -44)"]');
    expect(spark.getAttribute('transform')).toBe('translate(26 -44) rotate(45) scale(1 1) rotate(0 0 0)');
    expect(spark.parentElement?.getAttribute('transform')).toBe('translate(100 200)');
    expect(flipOf(svg).contains(spark)).toBe(false);
    const order = everyElementOf(svg);
    expect(order.indexOf(spark)).toBeLessThan(order.indexOf(bodyOf(svg)));
  });
});

describe('the page shapes of a behaviour', () => {
  const BUG_ON_THE_PAGE: Pose['page'] = {
    shapes: [{
      kind: 'circle', key: 'bug', centreX: 300, centreY: 600, radius: 3, fill: 'alarm',
    }],
    opacity:             0.5,
    fadeOutMilliseconds: 200,
  };

  test('they are drawn where the page puts them, behind all of Flint, never moved with Flint nor mirrored', () => {
    const svg = drawn(posed({ body: { positionX: 100, floorY: 200, facing: -1 }, page: BUG_ON_THE_PAGE }), 2);
    const bug = onlyElementOf(svg, 'page', 'circle');
    expect([bug.getAttribute('cx'), bug.getAttribute('cy'), bug.getAttribute('transform')]).toEqual(['300', '600', null]);
    const group = bug.parentElement;
    expect([group?.getAttribute('opacity'), group?.getAttribute('transform'), group?.parentElement?.getAttribute('transform')]).toEqual(['0.5', null, 'scale(2)']);
    expect(flipOf(svg).contains(bug)).toBe(false);
    const order = everyElementOf(svg);
    expect(order.indexOf(bug)).toBeLessThan(order.indexOf(bodyOf(svg)));
  });

  test('with none given, the page group is hidden', () => {
    const renderer = createSpriteRenderer({ document, pixelsForOneUnit: 1, bodyTakesPointer: true });
    renderer.draw(posed({ page: BUG_ON_THE_PAGE }));
    renderer.draw(NEUTRAL_POSE);
    expect(renderer.element.querySelector('g[data-flint-part="page"]')?.getAttribute('display')).toBe('none');
  });

  describe('confinement', () => {
    const BOX = Object.freeze({
      leftX: 100, rightX: 300, topY: 50, floorY: 150,
    });

    function confinementRectangleOf(svg: SVGSVGElement): readonly (string | null)[] {
      const rectangle = onlyElement(svg, '#flint-confinement rect');
      return ['x', 'y', 'width', 'height'].map((name) => rectangle.getAttribute(name));
    }

    test('a body told to take no pointer is blind to it, so no part of Flint takes a press', () => {
      expect(bodyOf(drawn(NEUTRAL_POSE, 1, false)).getAttribute('pointer-events')).toBe('none');
      expect(bodyOf(drawn(NEUTRAL_POSE, 1, true)).getAttribute('pointer-events')).toBe('visiblePainted');
    });

    test('a box holds all of the drawing, the page shapes too, in overlay units', () => {
      const renderer = createSpriteRenderer({ document, pixelsForOneUnit: 2, bodyTakesPointer: false });
      renderer.confine({ kind: 'inside', box: BOX });
      renderer.draw(posed({ page: BUG_ON_THE_PAGE }));
      const scaled = renderer.element.querySelector(':scope > g');
      expect([scaled?.getAttribute('transform'), scaled?.getAttribute('clip-path')]).toEqual(['scale(2)', 'url(#flint-confinement)']);
      expect(scaled?.contains(onlyElementOf(renderer.element, 'page', 'circle'))).toBe(true);
      expect(confinementRectangleOf(renderer.element)).toEqual(['100', '50', '200', '100']);
    });

    test('nowhere shows nothing, and everywhere lifts the clip', () => {
      const renderer = createSpriteRenderer({ document, pixelsForOneUnit: 1, bodyTakesPointer: false });
      renderer.confine({ kind: 'nowhere' });
      expect(confinementRectangleOf(renderer.element)).toEqual(['0', '0', '0', '0']);
      renderer.confine({ kind: 'everywhere' });
      expect(renderer.element.querySelector('[clip-path="url(#flint-confinement)"]')).toBeNull();
    });
  });
});
