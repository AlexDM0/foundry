/**
 * A ticket's documents record read and written back: the bytes stay the same and no key is added, a broken file is a `malformed` verdict,
 * never a throw, and a version's text counts only while it hashes to its name, byte for byte.
 */
import { writeFileSync }          from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { TicketDocumentRecord }     from '../../domain/tracker-model/@types/TicketDocument.ts';
import { TicketDocumentVersionUtil }     from '../../domain/tracker-model/utils/TicketDocumentVersionUtil.ts';
import { createScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import { loadedRecordFixture }           from '../../testing/TicketDocumentRecordFixtures.ts';
import { TicketDocumentContentFile }     from './TicketDocumentContentFile.ts';
import { TicketDocumentsFileIngestion }  from './TicketDocumentsFileIngestion.ts';
import { TicketDocumentsFileWriter }     from './TicketDocumentsFileWriter.ts';
import { TicketDocumentsProblemWording } from './TicketDocumentsProblemWording.ts';

const SPEC = '## Acceptance\n\nA1. The basket shows.\n';

function recordWithEveryKey(): TicketDocumentRecord {
  const { record } = loadedRecordFixture('004', {
    spec: { texts: [SPEC], approvals: [{ number: 1, by: 'person' }] },
    plan: { texts: ['## Files\n'], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
  });
  const [spec] = record.documents;
  const [firstVersion] = spec?.versions ?? [];
  if (spec === undefined || firstVersion === undefined) throw new Error('The fixture has no spec version.');
  firstVersion.constitutionCommit = 'c1';
  spec.readyAtNumber = 1;
  spec.messages.push({
    messageId:     'M1',
    commentNumber: 1,
    anchor:        {
      view:             'preview',
      versionNumber:    1,
      lines:            { from: 3, to: 3 },
      columns:          { from: 5, to: 10 },
      sectionPath:      ['Acceptance'],
      quote:            'basket',
      surroundingLines: { from: 1, to: 3 },
      diagram:          {
        lines: { from: 3, to: 3 }, diagramKind: 'flowchart', nodeId: 'A', nodeLabel: 'Basket'
      },
    },
    placement:      { from: 3, to: 3 },
    text:           'Name the total.',
    from:           'person',
    state:          'sent',
    queuedAt:       '2026-11-24T10:00:00.000Z',
    deliveryNumber: 1,
    agentTurn:      2,
  });
  spec.messages.push({
    messageId:  'M2',
    decisionId: 'E1',
    answer:     { question: 'Where does the basket keep its items?', choice: null, note: 'Neither.\n\nAsk the owner.' },
    text:       'Where does the basket keep its items?\nNeither.\n\nAsk the owner.',
    from:       'person',
    state:      'queued',
    queuedAt:   '2026-11-24T10:06:00.000Z',
  });
  spec.proposals.push({
    proposalId: 'P1',
    jobId:      'J4',
    baseNumber: 1,
    edits:      [{
      fromLine: 3, toLine: 3, originalLines: ['A1. The basket shows.'], replacementLines: ['A1. The basket shows its total.']
    }],
    summary:          'Name the total',
    answersMessageId: 'M1',
    forSpecNumber:    1,
    state:            'applied',
    appliedNumber:    2,
    at:               '2026-11-24T10:05:00.000Z',
  });
  return record;
}

describe('the record file', () => {
  test('a record with every optional key reads and writes back byte for byte', () => {
    const contents = TicketDocumentsFileWriter.contentsOf(recordWithEveryKey());
    const reading  = TicketDocumentsFileIngestion.parsedRecordOf(contents);
    if (reading.verdict !== 'parsed') throw new Error(TicketDocumentsProblemWording.sentenceOf(reading.problem));
    expect(reading.record).toEqual(recordWithEveryKey());
    expect(TicketDocumentsFileWriter.contentsOf(reading.record)).toBe(contents);
  });

  test('a record without optional keys gains none on a round trip', () => {
    const { record } = loadedRecordFixture('004', { spec: { texts: [] }, plan: { texts: [] } });
    const contents = TicketDocumentsFileWriter.contentsOf(record);
    const reading  = TicketDocumentsFileIngestion.parsedRecordOf(contents);
    if (reading.verdict !== 'parsed') throw new Error(TicketDocumentsProblemWording.sentenceOf(reading.problem));
    expect(TicketDocumentsFileWriter.contentsOf(reading.record)).toBe(contents);
    expect(contents).not.toContain('readyAtNumber');
  });

  test.each([
    ['no JSON', '{ not json', 'it is not valid JSON'],
    ['another version', JSON.stringify({
      version: 2, ticketId: '004', openedAt: 'x', documents: []
    }), 'version is not 1'],
    ['a document of an unknown kind', JSON.stringify({
      version: 1, ticketId: '004', openedAt: 'x', documents: [{ kind: 'brief' }]
    }), 'documents[0].kind is not one of spec, plan'],
    ['a kind twice',
      TicketDocumentsFileWriter.contentsOf({ ...recordWithEveryKey(), documents: [...recordWithEveryKey().documents, ...recordWithEveryKey().documents] }),
      'documents holds a kind twice'],
  ])('a file with %s is malformed, never a throw', (_case, contents, reason) => {
    const reading = TicketDocumentsFileIngestion.parsedRecordOf(contents);
    expect(reading.verdict).toBe('malformed');
    if (reading.verdict === 'malformed') expect(TicketDocumentsProblemWording.sentenceOf(reading.problem)).toContain(reason);
  });

  test('a file that is missing is malformed', () => {
    expect(new TicketDocumentsFileIngestion(join(createScratchDirectory('ticket-documents-missing'), 'record.json')).read().verdict).toBe('malformed');
  });
});

describe('a version file', () => {
  test('is the version only while its text hashes to its name', () => {
    const folder      = createScratchDirectory('ticket-document-version');
    const contentHash = TicketDocumentVersionUtil.contentHashOf(SPEC);
    const location    = join(folder, TicketDocumentContentFile.fileNameOf(contentHash));
    writeFileSync(location, SPEC);
    expect(TicketDocumentContentFile.read(location, contentHash)).toEqual({ verdict: 'readable', text: SPEC });
    writeFileSync(location, `${SPEC}changed\n`);
    expect(TicketDocumentContentFile.read(location, contentHash)).toEqual({ verdict: 'unreadable', problem: { code: 'text-hash-differs', contentHash } });
  });

  test('keeps a leading byte order mark, which its hash was taken over', () => {
    const folder      = createScratchDirectory('ticket-document-version-mark');
    const text        = `\uFEFF${SPEC}`;
    const contentHash = TicketDocumentVersionUtil.contentHashOf(text);
    const location    = join(folder, TicketDocumentContentFile.fileNameOf(contentHash));
    writeFileSync(location, text);
    expect(TicketDocumentContentFile.read(location, contentHash)).toEqual({ verdict: 'readable', text });
  });
});
