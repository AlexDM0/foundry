/**
 * `useTicketsHabitat` under the board's host of Flint, on a view of rows marked `data-ticket-id` as the Tickets table and the Kanban mark
 * theirs. What matters: the view is the `tickets` habitat; a change of the tickets reaches Flint as its cue; and a new bug naming a shown
 * ticket is chased from that ticket's row, while one naming a ticket not shown escapes.
 */
import { cleanup } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useRef } from 'react';

import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../testing/FlintHabitatScene.ts';
import type { CuedTicket }   from './TicketsSpriteModel.ts';
import { useTicketsHabitat } from './UseTicketsHabitat.ts';

afterEach(cleanup);

function TicketRows({ tickets }: { readonly tickets: readonly CuedTicket[] }) {
  const viewElement = useRef<HTMLElement>(null);
  useTicketsHabitat(viewElement, tickets);
  return (
    <section className="example-tickets" ref={viewElement} data-flint-workplace="">
      {tickets.map((ticket) => <div key={ticket.id} data-ticket-id={ticket.id} />)}
    </section>
  );
}

const DELIVERED: CuedTicket = { id: '001', status: 'delivered', resolvedPriority: 'normal' };

function sceneOfTickets(): FlintHabitatScene<readonly CuedTicket[]> {
  return flintHabitatSceneOf<readonly CuedTicket[]>({
    storedHabitatKind: 'tickets',
    viewOf:            (tickets) => <TicketRows tickets={tickets} />,
    firstProps:        [DELIVERED],
    placeView:         () => {
      placeAt(elementOf('.example-tickets'), 100, 100, 800, 400);
      placeAt(elementOf('[data-ticket-id="001"]'), 120, 160, 600, 30);
    },
  });
}

test('the view is the tickets habitat', () => {
  sceneOfTickets();
  expect(elementOf('.example-tickets').getAttribute('data-sprite-habitat')).toBe('tickets');
});

test('a held ticket reaches Flint as its cue', () => {
  const scene = sceneOfTickets();
  expect(scene.cuesReceived(() => scene.show([{ ...DELIVERED, hold: '' }]))).toEqual(['ticket-held']);
});

describe('a new bug', () => {
  test('naming a shown ticket is chased from that ticket\'s row', () => {
    const scene = sceneOfTickets();
    scene.show([DELIVERED, {
      id: '002', status: 'draft', resolvedPriority: 'normal', introducedBy: '001'
    }]);
    expect(scene.performed).toEqual([['chase-bug', elementOf('[data-ticket-id="001"]')]]);
  });

  test('naming a ticket not shown escapes', () => {
    const scene = sceneOfTickets();
    const cues = scene.cuesReceived(() => scene.show([DELIVERED, {
      id: '002', status: 'draft', resolvedPriority: 'normal', introducedBy: '000'
    }]));
    expect([cues, scene.performed]).toEqual([['bug-source-is-not-shown'], []]);
  });
});
