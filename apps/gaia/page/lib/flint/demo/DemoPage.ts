/**
 * The demo page: a playground on the package. It is a host like any other: it gives Flint a home, a card
 * as a habitat and a visit-target policy, and it drives every animation through `perform`, `attend` and `steer`. It makes one control
 * for each intent and each attendant from the catalogs, so a new animation shows here with no change: a gesture that aims is given the
 * floating square, and a behaviour that takes an element the grey bar of a ticket. The movement controls are in `flint/demo/index.html`,
 * each naming its steering in a `data-` attribute.
 */
import type { FlintHandle }                        from '../CreateFlint.ts';
import { createFlint }                             from '../CreateFlint.ts';
import { animationFrameSourceOf }                  from '../FrameSource.ts';
import { intentAimsAtElement }                     from '../IntentMeaning.ts';
import type { RegisteredHabitat, SpriteHabitat }   from '../SpriteHabitat.ts';
import { isSpriteIntent }                          from '../SpriteHabitat.ts';
import { ATTENDANT_CATALOG }                       from '../attendants/AttendantCatalog.ts';
import { BEHAVIOUR_INTENTS }                       from '../behaviours/BehaviourCatalog.ts';
import { EMOTE_NAMES }                             from '../emotes/EmoteCatalog.ts';
import { GESTURE_INTENTS }                         from '../gestures/GestureCatalog.ts';
import { elementUseOf }                            from '../mind/IntentApplication.ts';
import { DEMO_CARD_HABITAT_KIND, FLOATING_TARGET } from './constants/DemoStage.ts';

const CARD_HABITAT: SpriteHabitat = Object.freeze({
  kind:        DEMO_CARD_HABITAT_KIND,
  description: 'A card of the demo page that Flint pops in around.',
  suggestions: [],
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

/** One button for each intent, in the order of the catalog, under the group's heading. */
function addIntentButtons(page: Document, group: HTMLElement, intents: readonly string[], perform: (intent: string) => void): void {
  for (const intent of intents) {
    const button = page.createElement('button');
    button.type = 'button';
    button.textContent = intent;
    button.addEventListener('click', () => perform(intent));
    group.appendChild(button);
  }
}

/** One count for each attendant, from 0 to its maximum. */
function addAttendantCounts(page: Document, group: HTMLElement, attend: (attendant: string, count: number) => void): void {
  for (const attendant of ATTENDANT_CATALOG) {
    const label = page.createElement('label');
    const count = page.createElement('input');
    count.type = 'number';
    count.min = '0';
    count.max = String(attendant.maximumCount);
    count.value = '0';
    count.addEventListener('change', () => attend(attendant.name, Number(count.value)));
    label.append(count, ` ${attendant.name}`);
    group.appendChild(label);
  }
}

export function startDemoPage(page: Document): void {
  const view = page.defaultView;
  if (view === null) return;
  const stage = requiredElement(page, 'stage');
  const home = requiredElement(page, 'home');
  const card = requiredElement(page, 'card');
  const floatingTarget = requiredElement(page, 'floating-target');
  const timelineBar = requiredElement(page, 'timeline-bar');
  const readout = requiredElement(page, 'readout');
  const reducedMotionToggle = requiredElement(page, 'reduced-motion') as HTMLInputElement;
  let flint: FlintHandle | null = null;
  let popInIsArmed = false;

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
    const aims = isSpriteIntent(intent) && intentAimsAtElement(intent);
    const takesElement = isSpriteIntent(intent) && elementUseOf(intent) !== 'none';
    const toward = aims ? floatingTarget : timelineBar;
    const verdict = takesElement ? flint.perform(intent, toward) : flint.perform(intent);
    popInIsArmed = false;
    readout.textContent = `${intent}: ${verdict}`;
  };

  const steer = (steering: string): void => {
    if (flint === null) return;
    readout.textContent = `${steering}: ${flint.steer(steering)}`;
  };

  const attend = (attendant: string, count: number): void => {
    if (flint === null) return;
    readout.textContent = `${attendant} ${count}: ${flint.attend(attendant, count)}`;
  };

  addIntentButtons(page, requiredElement(page, 'gesture-controls'), GESTURE_INTENTS, perform);
  addIntentButtons(page, requiredElement(page, 'emote-controls'), EMOTE_NAMES, perform);
  addIntentButtons(page, requiredElement(page, 'behaviour-controls'), BEHAVIOUR_INTENTS, perform);
  addAttendantCounts(page, requiredElement(page, 'attendant-controls'), attend);
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
    } else if (Object.hasOwn(STEERING_KEYS, key)) {
      if (!event.repeat) steer(STEERING_KEYS[key] ?? '');
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
