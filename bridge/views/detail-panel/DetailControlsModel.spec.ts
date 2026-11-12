/**
 * The Bridge's controls on a ticket. What matters: they follow the stored status (Ready only while a draft or ready for review, Hold only
 * before a start, Unhold while held, network only while `draft` or `pending`, nothing once closed), and the merge wait carries git's
 * prediction, Accept pressable only on a clean one.
 */
import { describe, expect, test } from 'bun:test';

import { exampleDetailTicket }     from '../../testing/DetailBoardFixture.ts';
import { DetailControlsModelUtil } from './DetailControlsModel.ts';

describe('the ticket controls', () => {
  test('a draft offers Ready, Hold, Park and network', () => {
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('013', { status: 'draft' }), undefined)).toEqual({
      readies: true, holdMove: 'hold', parks: true, setsNetwork: true, network: [], deliversByHand: false
    });
  });

  test('a held ticket under review offers Unhold and Park, and no network', () => {
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('012', { status: 'in-review', hold: '', network: ['registry.example.com'] }), undefined)).toEqual({
      readies: false, holdMove: 'unhold', parks: true, setsNetwork: false, network: ['registry.example.com'], deliversByHand: true
    });
  });

  test('a closed ticket offers nothing', () => {
    const controls = DetailControlsModelUtil.controlsOf(exampleDetailTicket('014', { status: 'delivered' }), undefined);
    expect(controls).toEqual({
      readies: false, holdMove: null, parks: false, setsNetwork: false, network: [], deliversByHand: false
    });
    expect(DetailControlsModelUtil.offersAnyTicketControl(controls)).toBe(false);
  });

  test('typed domains split at commas and white space', () => {
    expect(DetailControlsModelUtil.networkDomainsOf(' a.example.com,b.example.com  c.example.com ')).toEqual(['a.example.com', 'b.example.com', 'c.example.com']);
  });
});

describe('the merge wait', () => {
  const mergeQueue = {
    targets: [{
      target:          'main',
      waitingForMerge: [
        {
          ticketId: '020', priority: 'normal', againstTarget: 'clean' as const, conflictedFiles: []
        },
        {
          ticketId: '021', priority: 'high', againstTarget: 'prediction-failed' as const, conflictedFiles: null
        },
      ],
    }],
  };

  test('a clean prediction may be accepted; one git could not make may not', () => {
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('020', { status: 'in-review' }), mergeQueue).mergeWait).toEqual({
      target: 'main', predictionText: 'merges cleanly into main', conflictedFiles: [], accepts: true
    });
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('021', { status: 'in-review' }), mergeQueue).mergeWait).toEqual({
      target: 'main', predictionText: 'git could not predict the merge into main', conflictedFiles: [], accepts: false
    });
  });

  test('a ticket that does not wait carries no merge wait', () => {
    expect(DetailControlsModelUtil.controlsOf(exampleDetailTicket('022', { status: 'in-review' }), mergeQueue).mergeWait).toBeUndefined();
  });
});
