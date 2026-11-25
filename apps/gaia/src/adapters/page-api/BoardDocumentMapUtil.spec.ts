/**
 * The board model mapped out to the page's board contract, on the model a scratch forge's recorded board reads into. What matters: every
 * value of the model reaches its page field, a forge sentence under the page's `text`; the served facts by name (attention with its typed
 * target, today with its date, the answering order, each ticket's and job's facts and offers, the step run times); a refusal's text is the
 * forge's sentence byte for byte, even one that names a command; a notice that names a command leaves in Gaia's words, its cause dropped;
 * each event and conversation entry carries the board's version; the ordered lists the views iterate keep the forge's order; and the Markdown
 * a forge serves (a ticket body, an epic description, a constitution) reaches the page as HTML rendered here, its raw HTML escaped and a
 * link with a script scheme dropped, since an agent wrote it. The forge's agent reaches the page with Gaia's own count of the other forges
 * that follow this machine's program, none unless counted, and a job not launched keeps the forge's cause, program and sentence.
 */
import { describe, expect, test } from 'bun:test';
import {
  AGENT_EFFORTS,
  FORGE_LEVEL_AGENT_ROLES,
  GATE_PHASES,
  PIPELINE_AGENT_ROLES,
} from 'forge-contracts/BoardVocabulary';

import {
  BOARD_AGENT_EFFORTS,
  BOARD_FORGE_LEVEL_AGENT_ROLES,
  BOARD_GATE_PHASES,
  BOARD_PIPELINE_AGENT_ROLES,
} from '../../../page/@types/board/BoardVocabulary.ts';
import { createMarkdownRenderer }                          from '../../lib/markdown-render/MarkdownRenderer.ts';
import type { BoardTranscriptEntry }                       from '../../shared/@types/board/BoardConversation.ts';
import type { ForgeBoard }                                 from '../../shared/@types/board/ForgeBoard.ts';
import { PAGE_CONTRACT_VERSIONS }                          from '../../shared/constants/PageContractVersions.ts';
import { CommandAnswerIngestion }                          from '../forge-api/CommandAnswerIngestion.ts';
import { recordedCalendarDateOf, recordedCommandAnswerOf } from '../forge-api/testing/BoardDocuments.ts';
import { BoardDocumentMapUtil }                            from './BoardDocumentMapUtil.ts';
import { ForgeSentenceUtil }                               from './ForgeSentenceUtil.ts';
import {
  markdownLeftAsWritten,
  modelLeavesOf,
  pageLeavesOf,
  recordedBoardModel
} from './testing/BoardModelLeaves.ts';

/** A day as the forge writes it: year, month and day of month. */
const CALENDAR_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** The recorded board holds far more values than this, so the comparison of leaves cannot pass on an empty board. */
const MINIMUM_RECORDED_BOARD_LEAVES = 300;

const SENTENCE_NAMING_A_COMMAND = 'Run `forge update` before the board launches again.';

const EXAMPLE_TRANSCRIPT_ENTRY: BoardTranscriptEntry = {
  cursor:          '4.1',
  entryKey:        '4.1.0',
  role:            'assistant',
  text:            'Which search provider should the storefront use?',
  at:              '2026-11-21T09:00:00+01:00',
  toolName:        null,
  parentToolUseId: null,
  toolUseId:       null,
  asksUser:        true,
  model:           'opus',
  tokens:          1200,
  clientAct:       null,
  sentBy:          null,
  chatSequence:    3,
  incidentIds:     ['I2'],
  pictures:        [{
    pictureId: 'a'.repeat(64), name: 'example-sketch.png', mediaType: 'image/png', bytes: 70
  }],
};

function boardWithNotice(board: ForgeBoard, causeSentence: string | null): ForgeBoard {
  return {
    ...board,
    notices: [{
      kind: 'example-notice', facts: { exampleFact: 1 }, sentence: SENTENCE_NAMING_A_COMMAND, causeSentence
    }],
    warnings: [{
      kind: 'example-warning', facts: {}, sentence: SENTENCE_NAMING_A_COMMAND, causeSentence: null
    }],
  };
}

describe('boardDocumentOf, on the recorded board', () => {
  test('carries every value of the model to its page field, a forge sentence under text', async () => {
    const board = await recordedBoardModel();
    const document = BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten);
    expect(Object.fromEntries(pageLeavesOf(document))).toEqual(Object.fromEntries(modelLeavesOf(board)));
    expect(pageLeavesOf(document).get('pipeline.setup.applyRefusal.text')).toBe(board.pipeline.setup?.applyRefusal?.sentence);
    expect(modelLeavesOf(board).size).toBeGreaterThan(MINIMUM_RECORDED_BOARD_LEAVES);
  });

  test('carries the Assistant\'s switch as the forge served it once switched off and once switched on again', async () => {
    const switchedOff = await recordedBoardModel('assistant-switched-off');
    const switchedOn = await recordedBoardModel('assistant-switched-on');
    expect(BoardDocumentMapUtil.boardDocumentOf(switchedOff, markdownLeftAsWritten).assistantIsOn).toBe(false);
    expect(BoardDocumentMapUtil.boardDocumentOf(switchedOn, markdownLeftAsWritten).assistantIsOn).toBe(true);
  });

  test('carries the board contract\'s version', async () => {
    expect(BoardDocumentMapUtil.boardDocumentOf(await recordedBoardModel(), markdownLeftAsWritten).boardVersion).toBe(PAGE_CONTRACT_VERSIONS.gaiaBoard);
  });

  test('keeps each attention entry\'s typed target, today with its date, and the open decisions in answering order', async () => {
    const document = BoardDocumentMapUtil.boardDocumentOf(await recordedBoardModel(), markdownLeftAsWritten);
    expect(document.attention.map(({ key, target }) => ({ key, target }))).toEqual([
      { key: 'decision:E2', target: { subject: 'decision', id: 'E2' } },
      { key: 'ticket:001', target: { subject: 'ticket', id: '001' } },
    ]);
    expect(document.today).toEqual({ calendarDate: await recordedCalendarDateOf('board-at-work'), deliveredTickets: 0, tokens: 0 });
    expect(document.today.calendarDate).toMatch(CALENDAR_DATE_SHAPE);
    expect(document.openDecisionIds).toEqual(['E2']);
    expect(document.escalatedDecisionIds).toEqual(['E2']);
  });

  test('keeps each ticket\'s offers and facts and each job\'s offers and stop holds as served', async () => {
    const board = await recordedBoardModel();
    const document = BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten);
    expect(document.page.tickets.map(({ facts, offers }) => ({ facts, offers }))).toEqual(board.page.tickets.map(({ facts, offers }) => ({ facts, offers })));
    expect(document.page.tickets[1]?.offers.kinds).toContain('ticket-deliver-by-hand');
    const assistant = document.jobs.find((job) => job.role === 'assistant');
    expect(assistant?.stopHolds).toEqual({ stop: `stopped by User (${assistant?.id})`, windDown: `wound down by User (${assistant?.id})` });
    expect(assistant?.offers).toEqual({ stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: true });
  });

  test('keeps the step run times, the entities draft\'s refusals with their typed fix, and the Apply refusal', async () => {
    const boardModel = await recordedBoardModel();
    const { setup, stepRunTimes } = BoardDocumentMapUtil.boardDocumentOf(boardModel, markdownLeftAsWritten).pipeline;
    const [recordedRunTime] = boardModel.pipeline.stepRunTimes;
    if (recordedRunTime === undefined) throw new Error('The recorded board holds no step run time.');
    expect(stepRunTimes).toEqual([{
      entity:          'web',
      stepKind:        'gate',
      stepName:        'unit',
      phase:           'build',
      runMilliseconds: recordedRunTime.runMilliseconds,
      ending:          'passed',
      at:              recordedRunTime.at,
    }]);
    expect(setup?.entityRefusals[0]).toMatchObject({ reason: 'equal-homes', shownOn: 'api', fix: { label: 'Remove apps/web from api' } });
    expect(setup?.entityRefusals[0]?.fix?.edits).toEqual([{ target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'], summary: null } }]);
    expect(setup?.applyRefusal).toEqual({
      refusedBy: 'forge',
      code:      'entity-refusals-stand',
      fields:    { setupId: 'S2', reasons: ['equal-homes'] },
      text:      'Pipeline setup S2\'s draft still holds 1 entity refusal (equal-homes): resolve every one before a step continues or the draft is applied. Nothing was written.',
    });
  });

  test('keeps the recorded notice as the forge worded it, since it names no command', async () => {
    const document = BoardDocumentMapUtil.boardDocumentOf(await recordedBoardModel(), markdownLeftAsWritten);
    expect(document.notices).toEqual([{
      kind:      'incident-defaulted',
      facts:     { incidentId: 'I2', move: 'incident-escalate', cause: 'turn-closed' },
      text:      'incident I2 took its default, incident-escalate: its delivery turn closed',
      causeText: 'its delivery turn closed',
    }]);
  });
});

describe('boardDocumentOf, on a forge\'s agent', () => {
  test('carries the agent with the count of other forges that follow this machine\'s program, none unless counted', async () => {
    const board = await recordedBoardModel();
    const uncounted = BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten);
    const { check: _modelCheck, ...agentWithoutCheck } = board.agent;
    expect(uncounted.agent).toMatchObject({ ...agentWithoutCheck, otherForgesFollowingMachine: 0 });
    const otherForgesFollowing = 2;
    expect(BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten, otherForgesFollowing).agent.otherForgesFollowingMachine).toBe(otherForgesFollowing);
  });

  test('carries a first setup record at its billing step with no billing chosen, each vendor\'s ways to bill and the places the installers use', async () => {
    const board = await recordedBoardModel('setup-choosing-billing');
    const document = BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten);
    expect(document.agent).toMatchObject({ places: board.agent.places, vendors: board.agent.vendors });
    expect(document.pipeline.setup?.record).toMatchObject({
      currentStep: 'billing', billing: null, stepStates: { agent: 'done', billing: 'in-progress' }, tools: board.agent.tools
    });
  });

  test('carries a job not launched with the forge\'s cause, program and sentence, and the check that does not run', async () => {
    const board = await recordedBoardModel('job-not-launched');
    const document = BoardDocumentMapUtil.boardDocumentOf(board, markdownLeftAsWritten);
    expect(document.jobs.map((job) => job.notLaunched)).toEqual(board.jobs.map((job) => (job.notLaunched === null
      ? null
      : { cause: job.notLaunched.cause, programPath: job.notLaunched.programPath, text: job.notLaunched.sentence })));
    expect(document.jobs.some((job) => job.notLaunched !== null)).toBe(true);
    expect(document.agent.check).toEqual(board.agent.check?.verdict === 'does-not-run'
      ? { verdict: 'does-not-run', cause: board.agent.check.cause, text: board.agent.check.sentence }
      : board.agent.check);
  });
});

describe('boardDocumentOf, on Markdown an agent wrote', () => {
  const HOSTILE_MARKDOWN = '## Wanted\n\nA <script>alert(1)</script> and <b>bold</b>, see [the **plan**](javascript:alert(1)) or [home](https://example.com/).\n';

  function boardWithHostileMarkdown(board: ForgeBoard): ForgeBoard {
    const [firstTicket, ...otherTickets] = board.page.tickets;
    const { setup } = board.pipeline;
    if (firstTicket === undefined || setup === null) throw new Error('The recorded board holds no ticket or no pipeline setup.');
    const entityFacts = Object.fromEntries(Object.entries(setup.entities ?? {}).map(([entityKey, facts]) => [entityKey, { ...facts, constitutionMarkdown: HOSTILE_MARKDOWN }]));
    return {
      ...board,
      page: {
        ...board.page,
        tickets:          [{ ...firstTicket, bodyMarkdown: HOSTILE_MARKDOWN }, ...otherTickets],
        epicDescriptions: [{ key: 'example-checkout', descriptionMarkdown: HOSTILE_MARKDOWN }],
      },
      pipeline: { ...board.pipeline, setup: { ...setup, constitutionMarkdown: HOSTILE_MARKDOWN, entities: entityFacts } },
    };
  }

  function expectEscapedAndWithoutTheScriptLink(html: string | null | undefined): void {
    expect(html).toContain('<h2>Wanted</h2>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('see the <strong>plan</strong> or <a href="https://example.com/">home</a>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('javascript:');
  }

  test('a ticket body, an epic description and each constitution reach the page escaped and without the script link', async () => {
    const { renderMarkdown } = createMarkdownRenderer();
    const document = BoardDocumentMapUtil.boardDocumentOf(boardWithHostileMarkdown(await recordedBoardModel()), renderMarkdown);
    const entityConstitutions = Object.values(document.pipeline.setup?.entities ?? {}).map((facts) => facts.constitutionHtml);

    expectEscapedAndWithoutTheScriptLink(document.page.tickets[0]?.bodyHtml);
    expectEscapedAndWithoutTheScriptLink(document.page.epicDescriptions[0]?.descriptionHtml);
    expectEscapedAndWithoutTheScriptLink(document.pipeline.setup?.constitutionHtml);
    expect(entityConstitutions.length).toBeGreaterThan(0);
    entityConstitutions.forEach(expectEscapedAndWithoutTheScriptLink);
  });

  test('no constitution stays null, and no Markdown key reaches the page', async () => {
    const board = await recordedBoardModel();
    const { setup } = board.pipeline;
    if (setup === null) throw new Error('The recorded board holds no pipeline setup.');
    const boardWithoutConstitution: ForgeBoard = { ...board, pipeline: { ...board.pipeline, setup: { ...setup, constitutionMarkdown: null } } };
    const document = BoardDocumentMapUtil.boardDocumentOf(boardWithoutConstitution, createMarkdownRenderer().renderMarkdown);

    expect(document.pipeline.setup?.constitutionHtml).toBeNull();
    expect([...pageLeavesOf(document).keys()].filter((leafPath) => leafPath.endsWith('Markdown'))).toEqual([]);
  });
});

describe('boardDocumentOf, on a notice or a warning that names a command', () => {
  test('words the notice in Gaia\'s words by its kind and keeps its facts', async () => {
    const document = BoardDocumentMapUtil.boardDocumentOf(boardWithNotice(await recordedBoardModel(), null), markdownLeftAsWritten);
    expect(document.notices).toEqual([{
      kind: 'example-notice', facts: { exampleFact: 1 }, text: ForgeSentenceUtil.noticeSentenceOf('example-notice', SENTENCE_NAMING_A_COMMAND), causeText: null
    }]);
    expect(document.notices[0]?.text).not.toContain('`');
  });

  test('drops a cause sentence that names a command', async () => {
    const document = BoardDocumentMapUtil.boardDocumentOf(boardWithNotice(await recordedBoardModel(), SENTENCE_NAMING_A_COMMAND), markdownLeftAsWritten);
    expect(document.notices[0]?.causeText).toBeNull();
  });

  test('words the warning in Gaia\'s neutral words', async () => {
    const document = BoardDocumentMapUtil.boardDocumentOf(boardWithNotice(await recordedBoardModel(), null), markdownLeftAsWritten);
    expect(document.warnings[0]?.text).toBe(ForgeSentenceUtil.warningSentenceOf(SENTENCE_NAMING_A_COMMAND));
    expect(document.warnings[0]?.text).not.toContain('`');
  });
});

describe('refusalDocumentOf', () => {
  test('keeps the recorded ticket-hold refusal\'s code and fields, and its sentence byte for byte though it names a command', async () => {
    const { status, body } = await recordedCommandAnswerOf('board-command-refused');
    const answer = new CommandAnswerIngestion().answerOf(status, body);
    if (answer.outcome !== 'refused') throw new Error(`The recorded ticket-hold was not refused: ${answer.outcome}.`);
    const document = BoardDocumentMapUtil.refusalDocumentOf(answer.refusal);
    expect(document).toEqual({
      refusedBy: 'forge', code: 'no-readable-ticket', fields: { reference: '999' }, text: answer.refusal.sentence
    });
    expect(Buffer.from(document.text).equals(Buffer.from(answer.refusal.sentence))).toBe(true);
    expect(ForgeSentenceUtil.sentenceNamesACommand(document.text)).toBe(true);
  });
});

describe('eventDocumentOf', () => {
  test('carries a board change and a part change as signals under the board\'s version', () => {
    expect(BoardDocumentMapUtil.eventDocumentOf({ kind: 'board-changed' })).toEqual({ boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard, kind: 'board-changed' });
    const partChanged = BoardDocumentMapUtil.eventDocumentOf({ kind: 'part-changed', part: 'pipeline' });
    expect(partChanged).toEqual({ boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard, kind: 'part-changed', part: 'pipeline' });
  });
});

describe('the conversation documents', () => {
  test('carry a history\'s every entry, every value of it, under the board\'s version', () => {
    const document = BoardDocumentMapUtil.historyDocumentOf([EXAMPLE_TRANSCRIPT_ENTRY]);
    expect(document).toEqual({ boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard, kind: 'history', entries: [EXAMPLE_TRANSCRIPT_ENTRY] });
  });

  test('carry a message as its one entry, and a profile line as its text', () => {
    const message = BoardDocumentMapUtil.messageDocumentOf(EXAMPLE_TRANSCRIPT_ENTRY);
    expect(message).toEqual({ boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard, kind: 'message', entry: EXAMPLE_TRANSCRIPT_ENTRY });
    const profileLine = BoardDocumentMapUtil.profileLineDocumentOf({ text: 'bun test v1.4.2' });
    expect(profileLine).toEqual({ boardVersion: PAGE_CONTRACT_VERSIONS.gaiaBoard, kind: 'line', line: { text: 'bun test v1.4.2' } });
  });

  test('pass over a key the model entry carries that the contract does not name', () => {
    const entryWithAnExtraKey = { ...EXAMPLE_TRANSCRIPT_ENTRY, exampleExtraKey: 'not in the contract' } as BoardTranscriptEntry;
    expect(BoardDocumentMapUtil.messageDocumentOf(entryWithAnExtraKey)).toEqual(BoardDocumentMapUtil.messageDocumentOf(EXAMPLE_TRANSCRIPT_ENTRY));
  });
});

describe('the ordered lists the views iterate', () => {
  test('keep the forge\'s values in the forge\'s order', () => {
    expect(BOARD_GATE_PHASES).toEqual([...GATE_PHASES]);
    expect(BOARD_PIPELINE_AGENT_ROLES).toEqual([...PIPELINE_AGENT_ROLES]);
    expect(BOARD_FORGE_LEVEL_AGENT_ROLES).toEqual([...FORGE_LEVEL_AGENT_ROLES]);
    expect(BOARD_AGENT_EFFORTS).toEqual([...AGENT_EFFORTS]);
  });
});

describe('boardDocumentOf, on a ticket with documents', () => {
  test('carries the ticket\'s documents summary to its page field, and none on a ticket without documents', async () => {
    const board = await recordedBoardModel();
    const [firstTicket, ...otherTickets] = board.page.tickets;
    if (firstTicket === undefined) throw new Error('The recorded board holds a ticket.');
    const documents = {
      spec:      { standing: 'approved', headNumber: 6, approvedNumber: 6 },
      plan:      { standing: 'unwritten', headNumber: null, approvedNumber: null },
      buildHeld: true,
    } as const;
    const boardWithDocuments: ForgeBoard = { ...board, page: { ...board.page, tickets: [{ ...firstTicket, documents }, ...otherTickets] } };
    const [mappedTicket, ...otherMappedTickets] = BoardDocumentMapUtil.boardDocumentOf(boardWithDocuments, markdownLeftAsWritten).page.tickets;
    expect(mappedTicket?.documents).toEqual(documents);
    expect(otherMappedTickets.filter((ticket) => 'documents' in ticket)).toEqual([]);
  });
});

describe('boardDocumentOf, on a ticket being written and a spec agent\'s question', () => {
  test('carries a draft\'s stage, wait, agent and wait start to its page field, and none on a ticket not being written', async () => {
    const board = await recordedBoardModel();
    const [firstTicket, ...otherTickets] = board.page.tickets;
    if (firstTicket === undefined) throw new Error('The recorded board holds a ticket.');
    const draft = {
      stage:       'spec-review',
      waitsOnUser: 'approval',
      agent:       {
        jobId: 'J4', role: 'spec-agent', tokens: 1200, since: '2026-11-25T09:00:00+01:00'
      },
      waitingSince: '2026-11-25T09:30:00+01:00',
    } as const;
    const boardWithDraft: ForgeBoard = { ...board, page: { ...board.page, tickets: [{ ...firstTicket, draft }, ...otherTickets] } };
    const [mappedTicket, ...otherMappedTickets] = BoardDocumentMapUtil.boardDocumentOf(boardWithDraft, markdownLeftAsWritten).page.tickets;
    expect(mappedTicket?.draft).toEqual(draft);
    expect(otherMappedTickets.filter((ticket) => 'draft' in ticket)).toEqual([]);
  });

  test('carries a question\'s document, anchor and placement, and each option\'s letter', async () => {
    const board = await recordedBoardModel();
    const [decision] = board.decisions;
    if (decision === undefined) throw new Error('The recorded board holds a decision.');
    const anchor = {
      view: 'code', versionNumber: 2, lines: { from: 6, to: 6 }, columns: null, sectionPath: ['Behaviour'], quote: null, surroundingLines: { from: 4, to: 8 }, diagram: null,
    } as const;
    const question = {
      ...decision, document: 'spec', anchor, placement: { from: 7, to: 7 }
    } as const;
    const [mapped] = BoardDocumentMapUtil.boardDocumentOf({ ...board, decisions: [question] }, markdownLeftAsWritten).decisions;
    expect([mapped?.document, mapped?.anchor, mapped?.placement]).toEqual(['spec', anchor, { from: 7, to: 7 }]);
    expect(mapped?.questions[0]?.options.map((option) => option.letter)).toEqual(decision.questions[0]?.options.map((option) => option.letter));
  });
});
