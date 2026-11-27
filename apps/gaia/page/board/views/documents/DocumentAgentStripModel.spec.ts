/**
 * The document agent's head and Flint strip: a working agent named by its running call and the version it started on, waiting on User for
 * an edit to review, an unresolved effect reading or its own open questions, and, idle, how to start by view.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTranscriptEntryDocument } from '../../../@types/board/ConversationDocument.ts';
import type { GaiaTicketDocumentsDocument }  from '../../../@types/board/TicketDocumentsDocument.ts';
import { FLINT_SLOT_CUES }                   from '../../flint/FlintSlotCues.ts';
import {
  DOCUMENT_STATES,
  PLAN_EFFECT_READING,
  PLAN_OUT_OF_DATE_TRANSCRIPT,
  PLAN_TRANSCRIPT,
  SPEC_TRANSCRIPT_IDLE,
  SPEC_TRANSCRIPT_SPLIT,
  SPEC_TRANSCRIPT_WORKING
} from '../../testing/TicketDocumentsFixture.ts';
import { DocumentAgentStripModelUtil, type DocumentViewMode } from './DocumentAgentStripModel.ts';
import { DocumentChatModel }                                  from './DocumentChatModel.ts';

type Shown = 'spec' | 'plan';

function stripOf(documents: GaiaTicketDocumentsDocument, shown: Shown, transcript: readonly BoardTranscriptEntryDocument[], view: DocumentViewMode = 'preview') {
  const [spec, plan] = documents.documents;
  const document = shown === 'spec' ? spec : plan;
  if (document === undefined || spec === undefined) throw new Error('no document');
  const effectReading = documents.effectReadings.findLast((reading) => reading.document === shown) ?? null;
  const chat = DocumentChatModel.documentChatOf(document, transcript, effectReading);
  return DocumentAgentStripModelUtil.stripOf({
    document, spec: shown === 'plan' ? spec : null, chat, effectReading, view
  });
}

describe('the document agent\'s strip', () => {
  test('a working agent reads the file its call names for the comment it answers, as artboard 1', () => {
    expect(stripOf(DOCUMENT_STATES.specWorking, 'spec', SPEC_TRANSCRIPT_WORKING)).toEqual({
      agentName: 'Spec agent', headLine: 'Replying to C2 · reads v4', status: 'Reading package.json for C2', cue: FLINT_SLOT_CUES.AGENT_READS,
    });
  });

  test('says the version it started on once the head moved under it, as artboard 5', () => {
    const strip = stripOf(DOCUMENT_STATES.specSplit, 'spec', SPEC_TRANSCRIPT_SPLIT, 'split');
    expect([strip.headLine, strip.status]).toEqual(['Replying to C3 · started on v5', 'Reading render.ts for C3']);
  });

  test('waits on User while its edit waits for review, as artboard 4', () => {
    expect(stripOf(DOCUMENT_STATES.specIdle, 'spec', SPEC_TRANSCRIPT_IDLE)).toMatchObject({
      headLine: 'Waiting on you · 1 edit to review',
      status:   'Waiting on you · 1 edit to review',
      cue:      FLINT_SLOT_CUES.AGENT_WAITS_ON_USER,
    });
  });

  test('on a plan the spec moved under, waits on User with its edit for the new spec, as artboard 8', () => {
    const strip = stripOf(DOCUMENT_STATES.planOutOfDate, 'plan', PLAN_OUT_OF_DATE_TRANSCRIPT);
    expect([strip.agentName, strip.headLine, strip.status]).toEqual(['Plan agent', 'Waiting on you · reads spec v6', 'Waiting on you · 1 edit for spec v6']);
  });

  test('the plan agent waits on User for the places its head\'s effect reading left unresolved, as artboard 7', () => {
    const strip = stripOf(DOCUMENT_STATES.plan, 'plan', PLAN_TRANSCRIPT);
    expect([strip.headLine, strip.status, strip.cue]).toEqual(['Idle · reads spec v5, plan v2', 'Waiting on you · 2 unresolved places', FLINT_SLOT_CUES.AGENT_WAITS_ON_USER]);
    const olderReading = { ...DOCUMENT_STATES.plan, effectReadings: [{ ...PLAN_EFFECT_READING, versionNumber: 1 }] };
    expect(stripOf(olderReading, 'plan', PLAN_TRANSCRIPT).cue).toBe(FLINT_SLOT_CUES.AGENT_IS_IDLE);
  });

  test('idle, says how to start in the view shown', () => {
    const idle = { ...DOCUMENT_STATES.specWorking };
    expect(stripOf(idle, 'spec', SPEC_TRANSCRIPT_IDLE.slice(0, 6)).status).toBe('Idle. Select text to comment, or ask.');
    expect(stripOf(idle, 'spec', SPEC_TRANSCRIPT_IDLE.slice(0, 6), 'code').status).toBe('Idle. Select lines to comment, or ask.');
  });

  test('an idle agent with its questions open waits on User\'s answers before its edits, as artboard 11', () => {
    const [spec] = DOCUMENT_STATES.specIdle.documents;
    if (spec === undefined) throw new Error('no spec');
    const chat = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_IDLE, null);
    expect(DocumentAgentStripModelUtil.stripOf({
      document: spec, spec: null, chat, effectReading: null, view: 'preview', openQuestionCount: 2
    })).toEqual({
      agentName: 'Spec agent', headLine: 'Waiting on your 2 answers · reads v4', status: 'Waiting on you · 2 questions to answer', cue: FLINT_SLOT_CUES.AGENT_WAITS_ON_USER,
    });
  });

  test('a call that names a file is read by its last segment', () => {
    expect(DocumentAgentStripModelUtil.namedFileOf({
      key: 'k', toolName: 'Read', inputText: '{"file_path":"apps/storefront/server/render.ts"}', state: 'running', startedAt: null
    }))
      .toBe('render.ts');
  });
});
