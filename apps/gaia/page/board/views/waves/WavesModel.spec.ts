/**
 * The dependencies view's model, laid out in waves. The cases that matter: a diamond lays out a Done column of what the open tickets build
 * on and one column per wave, the pace path first; Ready comes only from the forge's ready list and a held ticket wears Held; edges mark
 * the pace path and a settled dependency; nodes and heads are placed in pixels on one canvas; a ticket's lineage is itself, everything
 * upstream and everything waiting on it; a forecast is asked only while Hephaestus is running; a node names its ticket's first epic;
 * and a board where nothing depends on anything draws no view.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardHephaestusSetting } from '../../../@types/board/BoardVocabulary.ts';
import {
  exampleWavesBoard,
  exampleWavesEpic,
  exampleWavesTask,
  exampleWavesTicket
} from '../../testing/WavesBoardFixture.ts';
import { WavesModel, NODE_HEIGHT_PIXELS, NODE_WIDTH_PIXELS } from './WavesModel.ts';

const NOW_EPOCH_MILLISECONDS = Date.parse('2026-09-18T13:00:00+02:00');

const DIAMOND = exampleWavesBoard({
  tickets: [
    exampleWavesTicket('1', { status: 'delivered' }),
    exampleWavesTicket('2', { dependsOn: ['1'] }),
    exampleWavesTicket('3', { dependsOn: ['1'], status: 'in-progress' }),
    exampleWavesTicket('4', { dependsOn: ['2', '3'], hold: 'waiting on the example vendor' }),
  ],
  readyTicketIds: ['2'],
  displayStates:  { 3: 'in-progress' },
});

function diamondCanvas() {
  const canvas = WavesModel.wavesModelOf(DIAMOND, NOW_EPOCH_MILLISECONDS);
  if (canvas === null) throw new Error('the diamond has dependencies');
  return canvas;
}

describe('the waves', () => {
  test('lays out a Done column of what the open tickets build on, then one column per wave', () => {
    const canvas = diamondCanvas();

    expect(canvas.columns.map((column) => [column.label, column.countText, column.isNarrow])).toEqual([
      ['Done', '1 delivered', false],
      ['Now', '2 side by side', false],
      ['Wave 2', 'one at a time', true],
    ]);
    expect(canvas.columns[0]?.slotsFilled).toEqual([]);
    expect(canvas.columns[1]?.slotsFilled).toEqual([true, true, false]);
    expect(canvas.columns[1]?.slotsLabel).toBe('2 of 3 slots in use');
  });

  test('places every node in pixels, a column apart, the pace-path node first in its wave', () => {
    const canvas = diamondCanvas();
    const placeOf = (ticketId: string) => canvas.nodes.find((node) => node.ticketId === ticketId);

    expect(placeOf('2')?.top).toBeLessThan(placeOf('3')?.top ?? 0);
    expect((placeOf('4')?.left ?? 0) - (placeOf('2')?.left ?? 0)).toBeGreaterThan(NODE_WIDTH_PIXELS);
    expect(canvas.width).toBeGreaterThan(3 * NODE_WIDTH_PIXELS);
  });

  test('draws each edge from the right middle of a ticket to the left middle of the one waiting on it, bent at least 24px', () => {
    const canvas = diamondCanvas();
    const placeOf = (ticketId: string) => canvas.nodes.find((node) => node.ticketId === ticketId) ?? { left: 0, top: 0 };
    const { left: fromLeft, top: fromTop } = placeOf('2');
    const { left: toLeft, top: toTop } = placeOf('4');
    const startX = fromLeft + NODE_WIDTH_PIXELS;
    const startY = fromTop + NODE_HEIGHT_PIXELS / 2;
    const endY = toTop + NODE_HEIGHT_PIXELS / 2;
    const bend = Math.max(24, (toLeft - startX) / 2);

    expect(canvas.edges.find((edge) => edge.fromTicketId === '2' && edge.toTicketId === '4')?.path)
      .toBe(`M${startX} ${startY} C${startX + bend} ${startY} ${toLeft - bend} ${endY} ${toLeft} ${endY}`);
  });

  test('ends each node with its ticket’s first epic, and with none for a ticket in no epic', () => {
    const board = exampleWavesBoard({
      tickets: [
        exampleWavesTicket('1', { epics: ['checkout', 'payments'] }),
        exampleWavesTicket('2', { dependsOn: ['1'] }),
      ],
      epics: [exampleWavesEpic('payments', { slot: 1 }), exampleWavesEpic('checkout', { title: 'Checkout', slot: 3 })],
    });
    const primaryEpicOf = (ticketId: string) => WavesModel.wavesModelOf(board, NOW_EPOCH_MILLISECONDS)?.nodes.find((node) => node.ticketId === ticketId)?.primaryEpic;

    expect(primaryEpicOf('1')).toEqual({ title: 'Checkout', slot: 3 });
    expect(primaryEpicOf('2')).toBeNull();
  });

  test('says Ready only for a ticket the forge lists, Held for a held one, and the state while it is built', () => {
    const chipsOf = (ticketId: string) => diamondCanvas().nodes.find((node) => node.ticketId === ticketId)?.chips;

    expect(chipsOf('2')).toEqual([{ kind: 'ready' }]);
    expect(chipsOf('3')).toEqual([{ kind: 'state', displayState: 'in-progress', label: 'In progress' }]);
    expect(chipsOf('4')).toEqual([{ kind: 'held', title: 'Held: waiting on the example vendor' }]);
    expect(chipsOf('1')).toEqual([]);
  });

  test('counts what waits on each open ticket, and nothing on a done one', () => {
    const heldCountOf = (ticketId: string) => diamondCanvas().nodes.find((node) => node.ticketId === ticketId)?.heldCount;

    expect([heldCountOf('1'), heldCountOf('2'), heldCountOf('3'), heldCountOf('4')]).toEqual([0, 1, 1, 0]);
  });

  test('marks the pace path’s edges and the edges from a settled dependency', () => {
    const edges = diamondCanvas().edges.map((edge) => [`${edge.fromTicketId}>${edge.toTicketId}`, edge.isPace, edge.isSettled]);

    expect(edges.toSorted()).toEqual([['1>2', false, true], ['1>3', false, true], ['2>4', true, false], ['3>4', false, false]]);
  });

  test('asks for no forecast while Hephaestus is not running', () => {
    expect(diamondCanvas().columns.map((column) => column.forecastText)).toEqual([null, null, null]);
  });

  test('forecasts each open wave from the delivered history while Hephaestus is running, and none while it is paused', () => {
    const deliveredBuildRow = exampleWavesTask(1, {
      status:  'delivered',
      history: [{ status: 'in-progress', at: '2026-09-18T10:00:00+02:00' }, { status: 'in-review', at: '2026-09-18T10:30:00+02:00' }],
    });
    const boardWhileHephaestus = (hephaestusSetting: BoardHephaestusSetting) => exampleWavesBoard({
      tasks:   [deliveredBuildRow],
      tickets: [
        exampleWavesTicket('1', { status: 'delivered' }),
        exampleWavesTicket('2', { dependsOn: ['1'] }),
        exampleWavesTicket('3', { dependsOn: ['2'] }),
      ],
      ticketRows:     { 1: { ownTaskId: 1 } },
      readyTicketIds: ['2'],
      hephaestusSetting,
    });
    const forecastTextsWhile = (hephaestusSetting: BoardHephaestusSetting) => WavesModel.wavesModelOf(boardWhileHephaestus(hephaestusSetting), NOW_EPOCH_MILLISECONDS)
      ?.columns.map((column) => column.forecastText);

    expect(forecastTextsWhile('running')?.slice(1)).toEqual([expect.stringMatching(/^ETA /), expect.stringMatching(/^ETA /)]);
    expect(forecastTextsWhile('paused')).toEqual([null, null, null]);
  });
});

describe('lineage', () => {
  test('is the ticket, everything it depends on and everything waiting on it', () => {
    const canvas = diamondCanvas();

    expect([...WavesModel.lineageOf(canvas.graph, '2')].sort()).toEqual(['1', '2', '4']);
    expect([...WavesModel.lineageOf(canvas.graph, '4')].sort()).toEqual(['1', '2', '3', '4']);
  });
});

test('draws no view on a board where no ticket depends on another', () => {
  const board = exampleWavesBoard({ tickets: [exampleWavesTicket('1'), exampleWavesTicket('2')] });

  expect(WavesModel.wavesModelOf(board, NOW_EPOCH_MILLISECONDS)).toBeNull();
});
