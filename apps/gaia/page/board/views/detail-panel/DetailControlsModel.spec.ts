/**
 * The controls on a ticket. What matters: a control shows exactly when the forge's served offers hold its kind, whatever the ticket's
 * status says; the priority choices are the served ones without the priority the ticket runs at; and the merge wait carries git's prediction,
 * Accept and Update branch pressable only while the forge offers them.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }       from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import { exampleDetailTicket }      from '../../testing/DetailBoardFixture.ts';
import { DetailControlsModelUtil }  from './DetailControlsModel.ts';

const NO_MERGE_QUEUE: BoardDocument['mergeQueue'] = { queuedTicketIds: [], targets: [] };

function ticketOffering(kinds: BoardTicketDocument['offers']['kinds'], fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  return exampleDetailTicket('013', { offers: { kinds, priorityChoices: [] }, ...fields });
}

describe('the ticket controls', () => {
  test('show exactly the moves the forge offers', () => {
    expect(DetailControlsModelUtil.controlsOf(ticketOffering(['ticket-ready', 'ticket-hold', 'ticket-park', 'ticket-network']), NO_MERGE_QUEUE)).toEqual({
      readies: true, holdMove: 'hold', parks: true, setsNetwork: true, network: [], priorityChoices: [], deliversByHand: false
    });
    const heldTicket = ticketOffering(['ticket-unhold', 'ticket-park', 'ticket-deliver-by-hand'], { network: ['registry.example.com'] });
    expect(DetailControlsModelUtil.controlsOf(heldTicket, NO_MERGE_QUEUE)).toEqual({
      readies: false, holdMove: 'unhold', parks: true, setsNetwork: false, network: ['registry.example.com'], priorityChoices: [], deliversByHand: true
    });
  });

  test('follow the served offers, not the stored status', () => {
    const deliveredButOffered = ticketOffering(['ticket-hold'], { status: 'delivered' });
    const draftOfferingNothing = ticketOffering([], { status: 'draft' });
    expect(DetailControlsModelUtil.controlsOf(deliveredButOffered, NO_MERGE_QUEUE).holdMove).toBe('hold');
    expect(DetailControlsModelUtil.offersAnyTicketControl(DetailControlsModelUtil.controlsOf(draftOfferingNothing, NO_MERGE_QUEUE))).toBe(false);
  });

  test('offer the served priority choices, never the priority the ticket runs at, and none while the move is not offered', () => {
    const ticket = exampleDetailTicket('016', {
      offers: { kinds: ['ticket-priority'], priorityChoices: ['high', 'normal', 'low'] },
      facts:  {
        resolvedPriority: 'low', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: true, reviewRound: null, isRepeatReview: false
      },
    });
    expect(DetailControlsModelUtil.controlsOf(ticket, NO_MERGE_QUEUE).priorityChoices).toEqual(['high', 'normal']);
    expect(DetailControlsModelUtil.controlsOf({ ...ticket, offers: { kinds: [], priorityChoices: ['high'] } }, NO_MERGE_QUEUE).priorityChoices).toEqual([]);
  });

  test('typed domains split at commas and white space', () => {
    expect(DetailControlsModelUtil.networkDomainsOf(' a.example.com,b.example.com  c.example.com ')).toEqual(['a.example.com', 'b.example.com', 'c.example.com']);
  });
});

describe('the merge wait', () => {
  const mergeQueue: BoardDocument['mergeQueue'] = {
    queuedTicketIds: [],
    targets:         [{
      target:          'main',
      holder:          null,
      order:           [],
      waitingForMerge: [
        {
          ticketId: '020', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        },
        {
          ticketId: '021', priority: 'high', againstTarget: 'prediction-failed', conflictedFiles: null
        },
      ],
      pairwiseConflicts:      [],
      targetMovedDecisionIds: [],
    }],
  };

  test('carries the prediction, and Accept and Update branch as the forge offers them', () => {
    const cleanTicket = exampleDetailTicket('020', { status: 'in-review', offers: { kinds: ['merge-accept', 'merge-update'], priorityChoices: [] } });
    expect(DetailControlsModelUtil.controlsOf(cleanTicket, mergeQueue).mergeWait).toEqual({
      target: 'main', predictionText: 'merges cleanly into main', conflictedFiles: [], accepts: true, updates: true
    });
    const unpredictedTicket = exampleDetailTicket('021', { status: 'in-review', offers: { kinds: ['merge-update'], priorityChoices: [] } });
    expect(DetailControlsModelUtil.controlsOf(unpredictedTicket, mergeQueue).mergeWait).toEqual({
      target: 'main', predictionText: 'git could not predict the merge into main', conflictedFiles: [], accepts: false, updates: true
    });
  });

  test('a ticket that does not wait carries no merge wait', () => {
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('022', { status: 'in-review' }), mergeQueue).mergeWait).toBeUndefined();
  });
});
