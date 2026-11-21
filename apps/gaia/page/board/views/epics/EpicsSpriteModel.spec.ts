/**
 * What the epics habitat cues between two payloads (Flint's board wiring design, "New habitats", `epics`). What matters: a ticket whose `epics`
 * gets a key is cued once, also when it had none; the same keys, a key that goes, a new order of the same keys and a new ticket filed into
 * an epic are no change.
 */
import { expect, test } from 'bun:test';

import { EpicsSpriteModel, type CuedEpicTicket } from './EpicsSpriteModel.ts';

test.each<readonly [string, readonly CuedEpicTicket[], readonly CuedEpicTicket[], readonly string[]]>([
  ['a ticket\'s epics gets a key', [{ id: '001', epics: ['example-epic'] }], [{ id: '001', epics: ['example-epic', 'other-epic'] }], ['ticket-joined-an-epic']],
  ['a ticket in no epic joins one', [{ id: '001' }], [{ id: '001', epics: ['example-epic'] }], ['ticket-joined-an-epic']],
  ['two tickets join epics at once', [{ id: '001' }, { id: '002' }], [{ id: '001', epics: ['example-epic'] }, { id: '002', epics: ['example-epic'] }], ['ticket-joined-an-epic']],
  ['the same keys', [{ id: '001', epics: ['example-epic'] }], [{ id: '001', epics: ['example-epic'] }], []],
  ['a key that goes', [{ id: '001', epics: ['example-epic', 'other-epic'] }], [{ id: '001', epics: ['example-epic'] }], []],
  ['a new order of the same keys', [{ id: '001', epics: ['example-epic', 'other-epic'] }], [{ id: '001', epics: ['other-epic', 'example-epic'] }], []],
  ['a new ticket filed into an epic', [], [{ id: '001', epics: ['example-epic'] }], []],
])('%s', (_description, previous, next, cueNames) => {
  expect(EpicsSpriteModel.cuesBetween(previous, next)).toEqual(cueNames);
});
