/**
 * The board's host of Flint in a happy-dom document, on manual frames and stubbed boxes, with a recording brain to read what Flint
 * perceives. What matters: one overlay, hidden from assistive technology and blind to the pointer, so Flint blocks no click below it, and
 * the home corner beside it; Flint stays in its box, so it is drawn only inside the home corner, its body takes no press and a drag on it
 * carries nothing; the chat thread is the chat habitat and its card a workplace; Flint starts in the habitat the board stored and
 * stores where it lives under the board's key; a new turn of the thread and the first letter in the composer reach Flint as cues, the
 * turns a history brings never, since they are past; a press on the composer makes the thread the habitat Flint visits; in the Agents view
 * an agent that works is copied, Flint walking below the job column of its row, and after the agents were idle and Flint slept at home a
 * working agent does not wake it; a board occasion
 * reaches Flint wherever it is, a stream that comes back ends the unplugged loop with a wave, and each board shows a watcher spark for
 * each agent in flight, at most 4; a view below reaches Flint through `useFlintPerform`, with one of its own elements; and Flint has no
 * brain: no brain part is drawn and no request leaves the page while its director is asked.
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

import type { FlintHandle }                                from 'flint';
import type { Director, PerceptionDigest, SpriteIntent }   from 'flint/SpriteHabitat';
import { useFlintPerform }                                 from 'flint/react/UseFlintPerform';
import { useRef, type ReactNode }                          from 'react';
import { PRODUCT_NAMES }                                   from '../../../src/shared/constants/ProductNames.ts';
import type { BoardJobDocument }                           from '../../@types/board/BoardJobDocuments.ts';
import { ChatCard, ChatThread, type ChatTurn }             from '../conversation/ChatThread.tsx';
import { Composer }                                        from '../conversation/Composer.tsx';
import { boardPreferenceStoreOf, type PreferenceStore }    from '../preferences/PreferenceStore.ts';
import { BoardClockContext, type BoardClock }              from '../shell/BoardClock.ts';
import { BoardTrackerContext }                             from '../shell/BoardRouteLinks.ts';
import { ControlSurroundingsContext }                      from '../shell/ControlAvailability.ts';
import { boardStateFixture, exampleAgentJob }              from '../testing/BoardStateFixture.ts';
import { fakeControlSurroundingsOf }                       from '../testing/FakeControlSurroundings.ts';
import { createManualFlintFrames, type ManualFlintFrames } from '../testing/ManualFlintFrames.ts';
import { AgentsView }                                      from '../views/agents/AgentsView.tsx';
import { BoardFlint }                                      from './BoardFlint.tsx';
import type { BoardReading, OccasionBoard }                from './BoardOccasionModel.ts';
import { FLINT_HABITAT_CHOICE_NAME }                       from './FlintHabitatStorage.ts';

const FRAME_MILLISECONDS = 16;
/** A little over the time between two asks of the director, so it is asked once more. */
const DIRECTOR_ASK_MILLISECONDS = 3100;
const PIXELS_FOR_ONE_UNIT = 0.75;
const TRACKER_ID = 'example-tracker';
const STORED_HABITAT_KEY = `${PRODUCT_NAMES.programName}:board:${TRACKER_ID}:${FLINT_HABITAT_CHOICE_NAME}`;

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
  placeAt(elementOf('.board-flint-home'), 1064, 732, 112, 56);
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

interface HostProperties {
  readonly boardStore:    PreferenceStore | null;
  readonly frames:        ManualFlintFrames;
  readonly boardReading?: BoardReading;
  readonly children:      ReactNode;
}

function Host(properties: HostProperties) {
  return (
    <BoardFlint
      boardStore={properties.boardStore}
      frameSource={properties.frames.frameSource}
      {...(properties.boardReading === undefined ? {} : { boardReading: properties.boardReading })}
      onHandle={(made) => {
        if (made !== null) handles.push(made);
      }}
    >
      {properties.children}
    </BoardFlint>
  );
}

const WRITING_TURN: ChatTurn = {
  kind: 'agent', key: 'turn-1', speaker: 'Assistant', state: 'in-progress', stamp: null, workingText: 'working', toolUse: null, prose: 'Example answer',
};

const DONE_TURN: ChatTurn = { ...WRITING_TURN, workingText: null };

const COMPOSER_LABEL = 'Message Assistant J1';

function Chat({ turns, historyKey = 'J1' }: { readonly turns: readonly ChatTurn[]; readonly historyKey?: string | null }) {
  return (
    <BoardTrackerContext.Provider value={TRACKER_ID}>
      <ControlSurroundingsContext.Provider value={fakeControlSurroundingsOf().surroundings}>
        <ChatCard label="Assistant chat">
          <ChatThread label="Assistant conversation" turns={turns} renderDecision={() => null} historyKey={historyKey} />
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
    </BoardTrackerContext.Provider>
  );
}

function placeChat(): void {
  placePage();
  placeAt(elementOf('ol.board-chat-thread'), 200, 100, 600, 400);
}

describe('the page', () => {
  test('one overlay, hidden from assistive technology and blind to the pointer, and the home corner beside it', () => {
    render(<Host boardStore={null} frames={createManualFlintFrames()}><Chat turns={[]} /></Host>);
    expect(document.querySelectorAll('svg[data-flint]').length).toBe(1);
    expect([overlay().getAttribute('aria-hidden'), overlay().style.pointerEvents]).toEqual(['true', 'none']);
    expect(elementOf('.board-flint-home').getAttribute('aria-hidden')).toBe('true');
  });

  test('Flint stays in its box: drawn only inside the home corner, its body takes no press, and a drag on it carries nothing', () => {
    const frames = createManualFlintFrames();
    render(<Host boardStore={null} frames={frames}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    expect(overlay().querySelector(':scope > g')?.getAttribute('clip-path')).toBe('url(#flint-confinement)');
    const clip = overlay().querySelector('#flint-confinement rect');
    const clipInPixels = ['x', 'y', 'width', 'height'].map((name) => Math.round(Number(clip?.getAttribute(name)) * PIXELS_FOR_ONE_UNIT));
    expect(clipInPixels).toEqual([1064, 732, 112, 56]);
    const body = overlay().querySelector('path[pointer-events]');
    if (body === null) throw new Error('no body in the overlay');
    expect(body.getAttribute('pointer-events')).toBe('none');
    fireEvent.pointerDown(body, {
      button: 0, pointerId: 1, clientX: 1110, clientY: 770
    });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 400, clientY: 300 });
    advanceFor(frames, FRAME_MILLISECONDS);
    expect(elementOf('ol.board-chat-thread').hasAttribute('data-sprite-drop-target')).toBe(false);
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 400, clientY: 300 });
    advanceFor(frames, 3000);
    expect(handle().livesIn()).toBeNull();
  });

  test('the chat thread is the chat habitat, and its card a workplace', () => {
    render(<Host boardStore={null} frames={createManualFlintFrames()}><Chat turns={[]} /></Host>);
    expect(elementOf('ol.board-chat-thread').getAttribute('data-sprite-habitat')).toBe('chat');
    expect(elementOf('section.board-chat').hasAttribute('data-flint-workplace')).toBe(true);
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

  test('the turns a history brings, at the first open and after a switch to another job, cue nothing; a turn after them does', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:chat']]);
    const frames = createManualFlintFrames();
    const boardStore = boardStoreOver(entries);
    const page = render(<Host boardStore={boardStore} frames={frames}><Chat turns={[]} historyKey={null} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    advanceFor(frames, FRAME_MILLISECONDS * 2);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN]} historyKey="J1" /></Host>);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN, { ...WRITING_TURN, key: 'turn-2' }]} historyKey="J1" /></Host>);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[]} historyKey={null} /></Host>);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[{ ...DONE_TURN, key: 'turn-9' }]} historyKey="J2" /></Host>);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests.flatMap((digest) => digest.newCues)).toEqual(['agent-is-writing']);
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
  const STILL_CLOCK: BoardClock = {
    now:         () => new Date('2026-10-29T20:00:05Z'),
    everySecond: () => () => undefined,
    after:       () => () => undefined,
  };

  function Agents({ jobs }: { readonly jobs: readonly BoardJobDocument[] }) {
    return (
      <BoardTrackerContext.Provider value={TRACKER_ID}>
        <ControlSurroundingsContext.Provider value={fakeControlSurroundingsOf().surroundings}>
          <BoardClockContext.Provider value={STILL_CLOCK}>
            <AgentsView board={boardStateFixture({ jobs, decisions: [] })} selectedJobId={null} followTranscript={() => ({ close: () => undefined })} />
          </BoardClockContext.Provider>
        </ControlSurroundingsContext.Provider>
      </BoardTrackerContext.Provider>
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

  test('after the agents were idle and Flint slept at home, an agent that works again does not wake it: Flint reacts only to its box', () => {
    const entries = new Map([[STORED_HABITAT_KEY, '1:agent-panel']]);
    const frames = createManualFlintFrames();
    const boardStore = boardStoreOver(entries);
    const working = exampleAgentJob({ id: 'J12' });
    const idle = exampleAgentJob({ id: 'J12', state: 'stopping' });
    const page = render(<Host boardStore={boardStore} frames={frames}><Agents jobs={[working]} /></Host>);
    placeAgents();
    advanceFor(frames, FRAME_MILLISECONDS);
    page.rerender(<Host boardStore={boardStore} frames={frames}><Agents jobs={[idle]} /></Host>);
    placeAgents();
    // Idle agents ask for the playbook now, and only Flint's quiet rule sends it to sleep, so the spec sends it home itself.
    act(() => {
      handle().perform('sleep');
    });
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(figureX()).toBeGreaterThan(HOME_CORNER_LEFT_UNITS);
    fireEvent.pointerDown(elementOf('.agents-view'));
    page.rerender(<Host boardStore={boardStore} frames={frames}><Agents jobs={[working]} /></Host>);
    placeAgents();
    advanceFor(frames, 30000);
    expect([figureX() > HOME_CORNER_LEFT_UNITS, handle().livesIn()]).toEqual([true, null]);
  });
});

describe('the board occasions', () => {
  function readingOf(changes: { readonly paused?: boolean; readonly agentsInFlight?: number; readonly connection?: BoardReading['connection'] } = {}): BoardReading {
    const board: OccasionBoard = {
      overseer:    { state: 'serving', paused: changes.paused ?? false, generation: 1 },
      usage:       { resetsAt: null, window: null },
      jobs:        [],
      incidents:   [],
      concurrency: { agentsInFlight: changes.agentsInFlight ?? 0 },
    };
    return { board, connection: changes.connection ?? 'live', refusedCommandCount: 0 };
  }

  /** A prop that is not drawn keeps its group, at opacity 0. */
  function unpluggedSocketIsShown(): boolean {
    const socket = overlay().querySelector('g[data-flint-part="unpluggedSocket"]');
    return socket !== null && socket.getAttribute('opacity') !== '0';
  }

  function sparkCount(): number {
    return overlay().querySelectorAll('g[data-flint-part="watcher-spark"] rect[width="4"][height="4"][transform^="translate("]').length;
  }

  test('a board that pauses the Overseer makes Flint hold, wherever it is', () => {
    const frames = createManualFlintFrames();
    const page = render(<Host boardStore={null} frames={frames} boardReading={readingOf()}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    page.rerender(<Host boardStore={null} frames={frames} boardReading={readingOf({ paused: true })}><Chat turns={[]} /></Host>);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests[0]?.lastIntent).toBe('hold');
  });

  test('a stream that goes down unplugs Flint, and once it is back Flint waves, which ends the unplugged loop', () => {
    const frames = createManualFlintFrames();
    const page = render(<Host boardStore={null} frames={frames} boardReading={readingOf()}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, FRAME_MILLISECONDS);
    const brain = recordingBrain();
    handle().startBrain(brain, 60000);
    page.rerender(<Host boardStore={null} frames={frames} boardReading={readingOf({ connection: 'down' })}><Chat turns={[]} /></Host>);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests.at(-1)?.lastIntent).toBe('unplugged');
    expect(unpluggedSocketIsShown()).toBe(true);
    page.rerender(<Host boardStore={null} frames={frames} boardReading={readingOf({ connection: 'connecting' })}><Chat turns={[]} /></Host>);
    page.rerender(<Host boardStore={null} frames={frames} boardReading={readingOf()}><Chat turns={[]} /></Host>);
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    expect(brain.digests.at(-1)?.lastIntent).toBe('wave');
    expect(unpluggedSocketIsShown()).toBe(false);
  });

  test('each board shows a watcher spark for each agent in flight, at most 4', () => {
    const frames = createManualFlintFrames();
    const page = render(<Host boardStore={null} frames={frames} boardReading={readingOf({ agentsInFlight: 6 })}><Chat turns={[]} /></Host>);
    placeChat();
    advanceFor(frames, 1000);
    expect(sparkCount()).toBe(4);
    page.rerender(<Host boardStore={null} frames={frames} boardReading={readingOf({ agentsInFlight: 1 })}><Chat turns={[]} /></Host>);
    advanceFor(frames, 1000);
    expect(sparkCount()).toBe(1);
  });
});

describe('a view below the host', () => {
  /** A timeline bar whose button lays a bar along the bar's own element, and then asks for one with no element. */
  function TimelineBar({ onVerdicts }: { readonly onVerdicts: (verdicts: readonly string[]) => void }) {
    const bar = useRef<HTMLDivElement>(null);
    const perform = useFlintPerform();
    const layBar = (): void => {
      if (bar.current !== null) onVerdicts([perform('lay-bar-along', bar.current), perform('lay-bar-along')]);
    };
    return <div ref={bar}><button type="button" onClick={layBar}>Lay the bar</button></div>;
  }

  test('reaches Flint with useFlintPerform, which refuses one of its own elements while Flint lives in another box', () => {
    const verdicts: string[] = [];
    const onVerdicts = (given: readonly string[]): void => {
      verdicts.push(...given);
    };
    render(<Host boardStore={null} frames={createManualFlintFrames()}><TimelineBar onVerdicts={onVerdicts} /></Host>);
    fireEvent.click(screen.getByRole('button', { name: 'Lay the bar' }));
    expect(verdicts).toEqual(['outside-its-box', 'needs-an-element']);
  });
});

describe('no brain', () => {
  const BRAIN_WORDS = /brain/iu;

  test('no brain part is drawn and no request leaves the page while Flint\'s director is asked', () => {
    const requests: string[] = [];
    const pageFetch = globalThis.fetch;
    globalThis.fetch = Object.assign((request: Parameters<typeof fetch>[0]) => {
      requests.push(String(request));
      return Promise.reject(new Error('no request is expected'));
    }, { preconnect: pageFetch.preconnect });
    try {
      const entries = new Map([[STORED_HABITAT_KEY, '1:chat']]);
      const frames = createManualFlintFrames();
      const boardStore = boardStoreOver(entries);
      const page = render(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN]} /></Host>);
      placeChat();
      page.rerender(<Host boardStore={boardStore} frames={frames}><Chat turns={[DONE_TURN, { ...WRITING_TURN, key: 'turn-2' }]} /></Host>);
      advanceFor(frames, DIRECTOR_ASK_MILLISECONDS * 3);
      const labelledParts = [...document.querySelectorAll('[aria-label], [data-flint-part], button')]
        .flatMap((element) => [element.getAttribute('aria-label') ?? '', element.getAttribute('data-flint-part') ?? '', element.textContent]);
      expect([requests, labelledParts.filter((text) => BRAIN_WORDS.test(text))]).toEqual([[], []]);
    } finally {
      globalThis.fetch = pageFetch;
    }
  });
});
