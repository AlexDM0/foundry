/**
 * The ticket segments. What matters: every status stands in exactly one segment.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTicketStatus } from '../../../@types/board/BoardVocabulary.ts';
import { TicketSegmentUtil }      from './TicketSegmentUtil.ts';

const STATUSES: readonly BoardTicketStatus[] = ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'];

describe('segments', () => {
  test('drafts and tickets for review are In draft, committed to merged are Active, delivered and abandoned are Finished', () => {
    expect(STATUSES.map(TicketSegmentUtil.segmentOfStatus)).toEqual(['in-draft', 'in-draft', 'active', 'active', 'active', 'active', 'finished', 'finished']);
  });
});
