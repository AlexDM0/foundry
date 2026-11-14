/**
 * The demo page: the playground of the design handoff rebuilt on the package. It is a host like any other: it gives Flint a home, a card
 * as a habitat and a visit-target policy, and it drives every animation through `perform` and `steer`. Its controls are in
 * `flint/demo/index.html`, each naming its intent or steering in a `data-` attribute.
 */
import type { FlintHandle }                        from '../CreateFlint.ts';
import { createFlint }                             from '../CreateFlint.ts';
import { animationFrameSourceOf }                  from '../FrameSource.ts';
import type { RegisteredHabitat, SpriteHabitat }   from '../SpriteHabitat.ts';
import { DEMO_CARD_HABITAT_KIND, FLOATING_TARGET } from './constants/DemoStage.ts';

const CARD_HABITAT: SpriteHabitat = Object.freeze({
  kind:        DEMO_CARD_HABITAT_KIND,
  description: 'A card of the demo page that Flint pops in around.',
  suggestions: [],
});

/** The playground's keys: each press of T or R goes to the next mood, and after the angry mood Flint rests. */
const MOOD_CYCLE_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  t: ['type', 'type-busy', 'type-angry'],
  r: ['review', 'review-busy', 'review-angry'],
});

const INTENT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  p: 'point',
  g: 'grab',
  f: 'fasten',
  s: 'sleep',
  m: 'merge',
  e: 'research',
  k: 'make-ticket',
  h: 'wave',
  o: 'visit',
  1: 'annoyed',
  2: 'sweatdrop',
  3: 'surprised',
  4: 'doubt',
  5: 'thinking',
  6: 'idea',
  7: 'happy',
  8: 'nervous',
});

const STEERING_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'ArrowUp': 'jump', ' ': 'jump', 'w': 'jump', 'Escape': 'rest'
});

const HELD_WALK_KEYS: Readonly<Record<string, string>> = Object.freeze({
  ArrowLeft: 'walk-left', a: 'walk-left', ArrowRight: 'walk-right', d: 'walk-right',
});

function requiredElement(page: Document, id: string): HTMLElement {
  const element = page.getElementById(id);
  if (element === null) throw new Error(`the demo page has no #${id}`);
  return element;
}

function keyOf(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function startDemoPage(page: Document): void {
  const view = page.defaultView;
  if (view === null) return;
  const stage = requiredElement(page, 'stage');
  const home = requiredElement(page, 'home');
  const card = requiredElement(page, 'card');
  const floatingTarget = requiredElement(page, 'floating-target');
  const readout = requiredElement(page, 'readout');
  const reducedMotionToggle = requiredElement(page, 'reduced-motion') as HTMLInputElement;
  let flint: FlintHandle | null = null;
  let popInIsArmed = false;
  const moodCyclePlaces = new Map<string, number>();

  const pickCard = (habitats: readonly RegisteredHabitat[]): RegisteredHabitat | null => {
    if (!popInIsArmed) return null;
    return habitats.find((registered) => registered.habitat.kind === DEMO_CARD_HABITAT_KIND) ?? null;
  };

  const mount = (pixelsForOneUnit: number): void => {
    flint?.destroy();
    flint = createFlint({
      root:          page.body,
      home,
      pixelsForOneUnit,
      reducedMotion: () => reducedMotionToggle.checked,
      visitTarget:   pickCard,
    });
    flint.registerHabitat(card, CARD_HABITAT);
  };

  const perform = (intent: string): void => {
    if (flint === null) return;
    popInIsArmed = intent === 'visit';
    const verdict = intent === 'grab' ? flint.perform(intent, floatingTarget) : flint.perform(intent);
    popInIsArmed = false;
    readout.textContent = `${intent}: ${verdict}`;
  };

  const steer = (steering: string): void => {
    if (flint === null) return;
    readout.textContent = `${steering}: ${flint.steer(steering)}`;
  };

  const cycleMood = (cycleKey: string, intents: readonly string[]): void => {
    const place = ((moodCyclePlaces.get(cycleKey) ?? -1) + 1) % (intents.length + 1);
    moodCyclePlaces.set(cycleKey, place);
    const intent = intents[place];
    if (intent === undefined) steer('rest');
    else perform(intent);
  };

  for (const button of page.querySelectorAll<HTMLElement>('[data-intent]')) {
    button.addEventListener('click', () => perform(button.dataset['intent'] ?? ''));
  }
  for (const button of page.querySelectorAll<HTMLElement>('[data-steering]')) {
    button.addEventListener('click', () => steer(button.dataset['steering'] ?? ''));
  }
  for (const button of page.querySelectorAll<HTMLElement>('[data-held-walk]')) {
    button.addEventListener('pointerdown', () => steer(button.dataset['heldWalk'] ?? ''));
    for (const release of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(release, () => steer('stop-walking'));
  }
  for (const choice of page.querySelectorAll<HTMLInputElement>('input[name="size"]')) {
    choice.addEventListener('change', () => mount(Number(choice.value)));
  }
  for (const choice of page.querySelectorAll<HTMLInputElement>('input[name="ground"]')) {
    choice.addEventListener('change', () => {
      page.documentElement.dataset['ground'] = choice.value;
    });
  }

  stage.addEventListener('keydown', (event) => {
    const key = keyOf(event);
    if (Object.hasOwn(HELD_WALK_KEYS, key)) {
      if (!event.repeat) steer(HELD_WALK_KEYS[key] ?? '');
    } else if (Object.hasOwn(MOOD_CYCLE_KEYS, key)) {
      if (!event.repeat) cycleMood(key, MOOD_CYCLE_KEYS[key] ?? []);
    } else if (Object.hasOwn(STEERING_KEYS, key)) {
      if (!event.repeat) steer(STEERING_KEYS[key] ?? '');
    } else if (Object.hasOwn(INTENT_KEYS, key)) {
      if (!event.repeat) perform(INTENT_KEYS[key] ?? '');
    } else {
      return;
    }
    event.preventDefault();
  });
  stage.addEventListener('keyup', (event) => {
    if (Object.hasOwn(HELD_WALK_KEYS, keyOf(event))) steer('stop-walking');
  });
  stage.addEventListener('blur', () => steer('stop-walking'));

  animationFrameSourceOf(view)((elapsedMilliseconds) => {
    const bob = FLOATING_TARGET.BOB_PIXELS * Math.sin(elapsedMilliseconds / FLOATING_TARGET.BOB_DIVISOR_MILLISECONDS);
    const turn = (elapsedMilliseconds / FLOATING_TARGET.TURN_DIVISOR_MILLISECONDS) % FLOATING_TARGET.FULL_TURN_DEGREES;
    floatingTarget.style.transform = `translate(0px, ${bob}px) rotate(${turn}deg)`;
  });

  const checkedSize = page.querySelector<HTMLInputElement>('input[name="size"]:checked');
  mount(Number(checkedSize?.value ?? 1));
}
