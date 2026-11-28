/**
 * How a pipeline has its tickets written: an absent `ticketWriting` is today's one ticket and absent approvals are on, the builder and
 * reviewer read their defaults unless set (the reviewer always the spec), and on a forge with entities the rule is the ticket's entity's.
 */
import { describe, expect, test } from 'bun:test';

import type { AgentStepSettings, Pipeline } from '../@types/Pipeline.ts';
import { PIPELINE_FORMAT_VERSION }          from '../@types/Pipeline.ts';
import { TicketWritingUtil }                from './TicketWritingUtil.ts';

const { documentReadingRuleOf, documentReviewIsOn, routeOf } = TicketWritingUtil;

const MINIMAL: Pipeline = {
  version: PIPELINE_FORMAT_VERSION, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

function pipelineWith(fields: Partial<Pipeline>): Pipeline {
  return { ...MINIMAL, ...fields };
}

const READS_NO_PLAN: AgentStepSettings = { documents: { plan: 'never' } };

describe('routeOf', () => {
  test('reads an absent route, and no pipeline, as one ticket', () => {
    expect(routeOf(null)).toBe('one-ticket');
    expect(routeOf(MINIMAL)).toBe('one-ticket');
  });

  test('reads the stored route', () => {
    expect(routeOf(pipelineWith({ ticketWriting: 'spec-then-plan' }))).toBe('spec-then-plan');
  });
});

describe('documentReviewIsOn', () => {
  test('reads an absent approval, and no pipeline, as on', () => {
    expect(documentReviewIsOn(null, 'spec')).toBe(true);
    expect(documentReviewIsOn(pipelineWith({ approvals: { tickets: false } }), 'plan')).toBe(true);
  });

  test('reads a stored off as off, for that document only', () => {
    const pipeline = pipelineWith({ approvals: { plan: false } });
    expect(documentReviewIsOn(pipeline, 'plan')).toBe(false);
    expect(documentReviewIsOn(pipeline, 'spec')).toBe(true);
  });
});

describe('documentReadingRuleOf', () => {
  test('gives the builder both documents and the reviewer the plan only once a person approved it, by default', () => {
    expect(documentReadingRuleOf(null, 'builder', 'spec')).toBe('always');
    expect(documentReadingRuleOf(MINIMAL, 'builder', 'plan')).toBe('always');
    expect(documentReadingRuleOf(MINIMAL, 'reviewer', 'spec')).toBe('always');
    expect(documentReadingRuleOf(MINIMAL, 'reviewer', 'plan')).toBe('if-person-approved');
  });

  test('reads a rule the role\'s settings name', () => {
    expect(documentReadingRuleOf(pipelineWith({ agents: { builder: READS_NO_PLAN } }), 'builder', 'plan')).toBe('never');
  });

  test('gives the reviewer the spec always, even when a stored rule says otherwise', () => {
    const pipeline = pipelineWith({ agents: { reviewer: { documents: { spec: 'never' } } } });
    expect(documentReadingRuleOf(pipeline, 'reviewer', 'spec')).toBe('always');
  });

  test('gives a re-reviewer and a conflict re-reviewer the reviewer\'s rule', () => {
    const pipeline = pipelineWith({ agents: { reviewer: READS_NO_PLAN, reReviewer: { documents: { plan: 'always' } } } });
    expect(documentReadingRuleOf(pipeline, 'reReviewer', 'plan')).toBe('never');
    expect(documentReadingRuleOf(pipeline, 'conflictReReviewer', 'plan')).toBe('never');
  });

  test('on a forge with entities reads the rule of the ticket\'s entity', () => {
    const pipeline = pipelineWith({
      entities: {
        shop: {
          kind: 'app', home: ['/apps/shop'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, agents: { builder: READS_NO_PLAN }
        },
      },
    });
    expect(documentReadingRuleOf(pipeline, 'builder', 'plan', 'shop')).toBe('never');
    expect(documentReadingRuleOf(pipeline, 'builder', 'plan')).toBe('always');
  });
});
