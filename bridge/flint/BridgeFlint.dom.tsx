/**
 * The Bridge's host of Flint in a happy-dom document, on manual frames and stubbed boxes, with a recording brain to read what Flint
 * perceives. What matters: one overlay, hidden from assistive technology and blind to the pointer, so Flint blocks no click below it, and
 * the home corner beside it; the chat thread is the chat habitat and its card a workplace; Flint starts in the habitat the board stored and
 * stores where it lives under the board's key; a new turn of the thread and the first letter in the composer reach Flint as cues; a press
 * on the composer makes the thread the habitat Flint visits; and in the Agents view an agent that works is copied, Flint walking below
 * the job column of full-width rows, also when Flint slept at home first and comes back while the agent already works.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { ReactNode } from 'react';

import type { FlintHandle }                                from '../../flint/CreateFlint.ts';
import type { Director, PerceptionDigest, SpriteIntent }   from '../../flint/SpriteHabitat.ts';
import { PRODUCT_NAMES }                                   from '../../src/shared/constants/ProductNames.ts';
import type { IdentifiedRecord }                           from '../@types/BoardStateDocument.ts';
import { ChatCard, ChatThread, type ChatTurn }             from '../conversation/ChatThread.tsx';
import { Composer }                                        from '../conversation/Composer.tsx';
import { boardPreferenceStoreOf, type PreferenceStore }    from '../preferences/PreferenceStore.ts';
import type { BridgeClock }                                from '../shell/BridgeClock.ts';
import { ControlSurroundingsContext }                      from '../shell/ControlAvailability.ts';
import { exampleAgentJob }                                 from '../testing/BoardStateFixture.ts';
import { fakeControlSurroundingsOf }                       from '../testing/FakeControlSurroundings.ts';
import { createManualFlintFrames, type ManualFlintFrames } from '../testing/ManualFlintFrames.ts';
import { AgentsView }                                      from '../views/agents/AgentsView.tsx';
import { BridgeFlint }                                     from './BridgeFlint.tsx';
import { FLINT_HABITAT_CHOICE_NAME }                       from './FlintHabitatStorage.ts';

const FRAME_MILLISECONDS = 16;
/** A little over the time between two asks of the director, so it is asked once more. */
const DIRECTOR_ASK_MILLISECONDS = 3100;
const PIXELS_FOR_ONE_UNIT = 0.75;
const TRACKER_ID = 'example-tracker';
const STORED_HABITAT_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:${TRACKER_ID}:${FLINT_HABITAT_CHOICE_NAME}`;

const handles: FlintHandle[] = [];

afterEach(() => {
  handles.splice(0);
  cleanup();
});

function boardStoreOver(entries: Map<string, string>): PreferenceStore {
  return boardPreferenceStoreOf(TRACKER_ID, () => ({
    getItem:    (key) => entries.get(key) ?? null,
    setItem:    (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }));
}

function placeAt(element: Element, left: number, top: number, width: number, height: number): void {
  const rectangle = {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => rectangle as DOMRect;
}

function overlay(): SVGSVGElement {
  const found = document.querySelector('svg[data-flint]');
  if (!(found instanceof SVGSVGElement)) throw new Error('no Flint overlay on the page');
  return found;
}

function elementOf(selector: string): Element {
  const found = document.querySelector(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** A page of 1200 by 800 pixels with the home corner at the bottom right. */
function placePage(): void {
  placeAt(overlay(), 0, 0, 1200, 800);
  placeAt(elementOf('.bridge-flint-home'), 1064, 732, 112, 56);
}

function advanceFor(frames: ManualFlintFrames, milliseconds: number): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME_MILLISECONDS) act(() => frames.advance(FRAME_MILLISECONDS));
}

function recordingBrain(): Director & { readonly digests: PerceptionDigest[] } {
  const digests: PerceptionDigest[] = [];
  return {
    nextIntent: (digest): SpriteIntent => {
      digests.push(digest);
      return 'wander';
    },
    digests,
  };
}

function handle(): FlintHandle {
  const last = handles.at(-1);
  if (last === undefined) throw new Error('Flint was not made');
  return last;
}

function Host(properties: { readonly boardStore: PreferenceStore | null; readonly frames: ManualFlintFrames; readonly children: ReactNode }) {
  return (
    <BridgeFlint
      boardStore={properties.boardStore}
      frameSource={properties.frames.frameSource}
      onHandle={(made) => {
        if (made !== null) handles.push(made);
      }}
    >
      {properties.children}
    </BridgeFlint>
  );
}

const WRITING_TURN: ChatTurn = {
  kind: 'agent', key: 'turn-1', speaker: 'Assistant', state: 'in-progress', stamp: null, workingText: 'working', toolUse: null, prose: 'Example answer',
};

const DONE_TURN: ChatTurn = { ...WRITING_TURN, workingText: null };

const COMPOSER_LABEL = 'Message Assistant J1';

function Chat({ turns }: { readonly turns: readonly ChatTurn[] }) {
  return (
    <ControlSurroundingsContext.Provider value={fakeControlSurroundingsOf().surroundings}>
      <ChatCard label="Assistant chat">
        <ChatThread label="Assistant conversation" turns={turns} renderDecision={() => null} />
        <Composer
          label={COMPOSER_LABEL}
          recipientLabel="Assistant"
          recipientJobId="J1"
          status={null}
          placeholder={COMPOSER_LABEL}
          sendLabel="Send"
          commandOf={() => null}
        />
      </ChatCard>
    </ControlSurroundingsContext.Provider>
  );
}

function placeChat(): void {
  placePage();
  placeAt(elementOf('ol.bridge-chat-thread'), 200, 100, 600, 400);
}

describe('the page', () => {
  test('one overlay, hidden from assistive technology and blind to the pointer, and the home corner beside it', () => {
    render(<Host boardStore={null} frames={createManualFlintFrames()}><Chat turns={[]} /></Host>);
    expect(document.querySelectorAll('svg[data-flint]').length).toBe(1);
    expect([overlay().getAttribute('aria-hidden'), overlay().style.pointerEvents]).toEqual(['true', 'none']);
    expect(elementOf('.bridge-flint-home').getAttribute('aria-hidden')).toBe('true');
  });

  test('the chat thread is the chat habitat, and its card a workplace', () => {
    render(<Host boardStore={null} frames={createManualFlintFrames()}><Chat turns={[]} /></Host>);
    expect(elementOf('ol.bridge-chat-thread').getAttribute('data-sprite-habitat')).toBe('chat');
    expect(elementOf('section.bridge-chat').hasAttribute('data-flint-workplace')).toBe(true);
  });
});

describe('the chat habitat', () => {
  test('Flint starts in the habitat the board stored, and stores its way home under the board\'s key', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:chat']]);
    const frames = createManualFlintFrames();
    render(<Host boardStore={boardStoreOver(entries)} frames={frames}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests[0]?.habitatKind).toBe('chat');
    handle().stopBrain();
    handle().perform('sleep');
    advanceFor(frames, FRAME_MILLISECONDS * 2);
    expect(entries.get(STORED_HABITAT_KEY)).toBe('1:');
  });

  test('a new turn of the thread and the first letter in the composer reach Flint as cues', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:chat']]);
    const frames = createManualFlintFrames();
    const boardStore = boardStoreOver(entries);
    const page = render(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    advanceFor(frames, FRAME_MILLISECONDS * 2);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN, { ...WRITING_TURN, key: 'turn-2' }]} /></Host>);
    const composer = screen.getByLabelText(COMPOSER_LABEL);
    fireEvent.change(composer, { target: { value: 'E' } });
    fireEvent.change(composer, { target: { value: 'Ex' } });
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests.flatMap((digest) => digest.newCues)).toEqual(['agent-is-writing', 'user-is-typing']);
  });

  test('a press on the composer makes the thread the habitat Flint visits', () => {
    const frames = createManualFlintFrames();
    render(<Host boardStore={null} frames={frames}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    fireEvent.pointerDown(screen.getByLabelText(COMPOSER_LABEL));
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests[0]).toMatchObject({ habitatKind: null, visitTargetKind: 'chat' });
  });
});

describe('the agent panel habitat', () => {
  const STILL_CLOCK: BridgeClock = {
    now:         () => new Date('2026-10-29T20:00:05Z'),
    everySecond: () => () => undefined,
    after:       () => () => undefined,
  };

  function Agents({ jobs }: { readonly jobs: readonly IdentifiedRecord[] }) {
    return (
      <AgentsView
        project="Example Agency"
        jobs={jobs}
        decisions={[]}
        incidents={[]}
        launchSlots={null}
        concurrency={null}
        tickets={[]}
        selectedJobId={null}
        clock={STILL_CLOCK}
        timestampSlices={null}
      />
    );
  }

  /** The figure's place in sprite units, read from its translation. */
  function figureX(): number {
    const transform = overlay().querySelector('g[transform^="translate("]')?.getAttribute('transform') ?? '';
    return Number(/^translate\((?<x>[-\d.]+) /u.exec(transform)?.groups?.['x']);
  }

  /** The view at 100 to 900 pixels, each row as wide as the view, and the job cell its first 200 pixels. */
  function placeAgents(): void {
    placePage();
    placeAt(elementOf('.agents-view'), 100, 100, 800, 400);
    for (const row of document.querySelectorAll('[data-job-id]')) {
      placeAt(row, 100, 160, 800, 30);
      const jobCell = row.querySelector('td[data-column="job"]');
      if (jobCell !== null) placeAt(jobCell, 100, 160, 200, 30);
    }
  }

  const JOB_CELL_CENTRE_UNITS = 200 / PIXELS_FOR_ONE_UNIT;
  const HOME_CORNER_LEFT_UNITS = 1064 / PIXELS_FOR_ONE_UNIT;

  test('an agent that starts working is copied: Flint walks below the job column of its row', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:agent-panel']]);
    const frames = createManualFlintFrames();
    const boardStore = boardStoreOver(entries);
    const page = render(<Host boardStore={boardStore} frames={frames}><Agents jobs={[]} /></Host>);
    placeAgents();
    advanceFor(frames, FRAME_MILLISECONDS);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Agents jobs={[exampleAgentJob({ id: 'J12' })]} /></Host>);
    placeAgents();
    advanceFor(frames, 12000);
    expect(Math.abs(figureX() - JOB_CELL_CENTRE_UNITS)).toBeLessThanOrEqual(4);
  });

  test('after all agents were idle and Flint slept at home, an agent that works again is copied once Flint is back', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:agent-panel']]);
    const frames = createManualFlintFrames();
    const boardStore = boardStoreOver(entries);
    const working = exampleAgentJob({ id: 'J12' });
    const waiting = exampleAgentJob({ id: 'J12', state: 'waiting' });
    const page = render(<Host boardStore={boardStore} frames={frames}><Agents jobs={[working]} /></Host>);
    placeAgents();
    advanceFor(frames, FRAME_MILLISECONDS);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Agents jobs={[waiting]} /></Host>);
    placeAgents();
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(figureX()).toBeGreaterThan(HOME_CORNER_LEFT_UNITS);
    fireEvent.pointerDown(elementOf('.agents-view'));
    page.rerender(<Host boardStore={boardStore} frames={frames}><Agents jobs={[working]} /></Host>);
    placeAgents();
    advanceFor(frames, 30000);
    expect(Math.abs(figureX() - JOB_CELL_CENTRE_UNITS)).toBeLessThanOrEqual(4);
  });
});
