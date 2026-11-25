/**
 * A ticket's spec and plan as Gaia holds them, built by hand until a recorded forge serves them: an approved spec with a comment on a
 * diagram node, an applied and a conflicted proposal, and a plan out of date with its effect reading. Every optional value is set somewhere,
 * so a spec that compares leaves sees each key reach the page. Test-only.
 */
import type { BoardTicketDocuments } from '../../../shared/@types/board/TicketDocuments.ts';

export const EXAMPLE_TICKET_DOCUMENTS: BoardTicketDocuments = {
  ticketId:  '004',
  documents: [
    {
      document:        'spec',
      standing:        'approved',
      reviewer:        'person',
      holdsAcceptance: true,
      editable:        true,
      proposalMode:    'ask-first',
      head:            {
        number: 6, contentHash: 'c0ffee06', author: 'person', jobId: null, at: '2026-11-24T13:52:00+01:00', constitutionCommit: null, constitutionNumber: null,
      },
      markdown: '# Example spec\n\n## Outcome\n\nThe theme follows the tokens.\n',
      versions: [
        {
          number: 5, contentHash: 'c0ffee05', author: 'agent', jobId: 'J7', at: '2026-11-24T13:05:00+01:00', constitutionCommit: '0123abc', constitutionNumber: 3,
        },
        {
          number: 6, contentHash: 'c0ffee06', author: 'person', jobId: null, at: '2026-11-24T13:52:00+01:00', constitutionCommit: null, constitutionNumber: null,
        },
      ],
      approvals: [
        {
          number:             6,
          contentHash:        'c0ffee06',
          by:                 'person',
          at:                 '2026-11-24T13:55:00+01:00',
          constitutionCommit: '0123abc',
          constitutionNumber: 3,
          onSpecNumber:       null,
          onSpecContentHash:  null,
        },
      ],
      messages: [
        {
          messageId:     'M1',
          commentNumber: 1,
          decisionId:    null,
          answer:        null,
          anchor:        {
            view:             'preview',
            versionNumber:    5,
            lines:            { from: 20, to: 20 },
            columns:          { from: 5, to: 18 },
            sectionPath:      ['Example spec', 'Behaviour'],
            quote:            'Theme[Read theme]',
            surroundingLines: { from: 17, to: 23 },
            diagram:          {
              lines: { from: 17, to: 23 }, diagramKind: 'flowchart', nodeId: 'Theme', nodeLabel: 'Read theme'
            },
          },
          placement:      { from: 21, to: 21 },
          orphaned:       false,
          text:           'Name the theme tokens here.',
          from:           'person',
          state:          'applied',
          queuedAt:       '2026-11-24T13:10:00+01:00',
          deliveryNumber: 1,
          agentTurn:      2,
        },
        {
          messageId:      'M2',
          commentNumber:  null,
          decisionId:     null,
          answer:         null,
          anchor:         null,
          placement:      null,
          orphaned:       false,
          text:           'Your edit of line 29 met newer text, so it was not applied.',
          from:           'board',
          state:          'queued',
          queuedAt:       '2026-11-24T13:40:00+01:00',
          deliveryNumber: null,
          agentTurn:      null,
        },
      ],
      proposals: [
        {
          proposalId: 'P1',
          jobId:      'J7',
          baseNumber: 5,
          edits:      [{
            fromLine: 21, toLine: 21, originalLines: ['Read the theme.'], replacementLines: ['Read the theme from the board tokens.']
          }],
          summary:          'Names the tokens.',
          answersMessageId: 'M1',
          forSpecNumber:    null,
          state:            'applied',
          appliedNumber:    6,
          at:               '2026-11-24T13:20:00+01:00',
          headLines:        { from: 21, to: 21 },
        },
        {
          proposalId: 'P2',
          jobId:      'J7',
          baseNumber: 5,
          edits:      [{
            fromLine: 30, toLine: 29, originalLines: [], replacementLines: ['A new line.']
          }],
          summary:          'Adds a line.',
          answersMessageId: null,
          forSpecNumber:    null,
          state:            'conflicted',
          appliedNumber:    null,
          at:               '2026-11-24T13:38:00+01:00',
          headLines:        null,
        },
      ],
      agentJobId: null,
      outOfDate:  null,
    },
    {
      document:        'plan',
      standing:        'out-of-date',
      reviewer:        'pipeline',
      holdsAcceptance: false,
      editable:        false,
      proposalMode:    'auto-apply',
      head:            null,
      markdown:        '',
      versions:        [],
      approvals:       [
        {
          number:             3,
          contentHash:        'beef0003',
          by:                 'pipeline',
          at:                 '2026-11-24T13:45:00+01:00',
          constitutionCommit: '0123abc',
          constitutionNumber: null,
          onSpecNumber:       5,
          onSpecContentHash:  'c0ffee05',
        },
      ],
      messages:   [],
      proposals:  [],
      agentJobId: 'J9',
      outOfDate:  {
        approvedOnSpecNumber: 5,
        specNumber:           6,
        specChanges:          [{
          originalFromLine: 21, originalLines: ['Read the theme.'], replacementFromLine: 21, replacementLines: ['Read the theme from the board tokens.']
        }],
      },
    },
  ],
  effectReadings: [
    {
      document:             'plan',
      versionNumber:        3,
      state:                'read',
      durationMilliseconds: 1400,
      references:           [{ reference: 1, lines: { from: 4, to: 5 }, quote: 'Read the tokens in the frame.' }],
      entries:              [
        {
          reference: 1, path: 'page/diagram-frame/DiagramFrameScript.ts', change: 'changes', detail: 'Reads the tokens.', unresolvedReason: null, candidates: [],
        },
        {
          reference:        1,
          path:             'Theme.ts',
          change:           'unresolved',
          detail:           'Names a theme file.',
          unresolvedReason: 'ambiguous',
          candidates:       ['page/Theme.ts', 'src/Theme.ts'],
        },
      ],
    },
    {
      document: 'spec', versionNumber: 6, state: 'reading', durationMilliseconds: null, references: [], entries: [],
    },
  ],
};
