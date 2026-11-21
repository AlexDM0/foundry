/**
 * The role table of design section 4.4, case by case: what a worker may file and how its filing is stamped, the worker limit, the product
 * owner's own-draft rule and its own-job stamp on `intake-close` and `intake-title`, its entity rule (its own draft or any ticket ready for
 * review or pending, stamped with its job), the own-job stamp on the `question-options` of every role that asks User, a builder's need for
 * another entity (only from the builder of an entity's stage, only complete, stamped with its job; incomplete covering a field that is no
 * text; never for a package sealed for its ticket, E42), the pipeline agent's setup moves stamped with its job, its setup and, for an
 * entity's session, its entity (every other kind refused, and a setup or entity of the agent's own choosing too), the Assistant's incident
 * moves, `talos-restart` refused for every role, and the planted forgeries (a `role`, a `jobId` or an admission in the command). Identity
 * is the job record's, so a request in another job's folder is judged as that folder's job, which the last case plants.
 */
import { describe, expect, test } from 'bun:test';

import type { IncidentKind, IncidentMove }                from '../../lib/tracker-model/@types/Incident.ts';
import type { JobRole }                                   from '../../lib/tracker-model/@types/Job.ts';
import { INCIDENT_KINDS }                                 from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { JOB_ROLES }                                      from '../../lib/tracker-model/constants/JobStates.ts';
import type { ControlCommand, ControlCommandOf }          from '../../shared/@types/ControlCommand.ts';
import { WORKER_FILINGS_PER_JOB }                         from '../../shared/constants/OverseerLimits.ts';
import { Bouncer, type BouncerVerdict, type RelayingJob } from './Bouncer.ts';
import { CONTROL_COMMAND_KINDS }                          from './ControlService.ts';
import { ALLOWED_MOVES_BY_INCIDENT_KIND }                 from './constants/AllowedMovesByIncidentKind.ts';

function jobOf(role: JobRole | null, overrides: Partial<RelayingJob> = {}): RelayingJob {
  return {
    id: 'J12', role, ticketIds: ['003'], filedTickets: [], deliveredIncidents: [], ticketIdsReadyForReviewOrCommitted: [], setupId: null, ...overrides
  };
}

function lowFinding(overrides: Partial<ControlCommandOf<'ticket-add'>> = {}): ControlCommandOf<'ticket-add'> {
  return {
    kind:          'ticket-add',
    title:         'The export dialog forgets the folder',
    type:          'bug',
    priority:      'low',
    dependsOn:     [],
    epics:         [],
    network:       [],
    introducedBy:  null,
    foundInReview: '003',
    bodyText:      null,
    ...overrides,
  };
}

const EDIT_OF_TICKET_7: ControlCommand = {
  kind: 'ticket-edit', ticketReference: '#7', title: 'Sharper title', bodyText: null, appendsBody: false
};

describe('builder and reviewer', () => {
  test.each(['builder', 'reviewer'] as const)('%s files a low finding stamped with its job and its job\'s tickets as finders', (role) => {
    expect(Bouncer.verdictOf(jobOf(role, { ticketIds: ['003', '004'] }), lowFinding())).toEqual({
      verdict: 'admitted',
      command: { ...lowFinding(), admission: { filedByJob: 'J12', finderTicketIds: ['003', '004'] } },
    });
  });

  test('size, type, body and both ticket links are a finding\'s flags', () => {
    const command = lowFinding({
      size: 'S', type: 'research', bodyText: '## Report\nFound.\n', introducedBy: '002'
    });
    expect(Bouncer.verdictOf(jobOf('reviewer'), command).verdict).toBe('admitted');
  });

  test.each([
    ['no priority', {}],
    ['normal priority', { priority: 'normal' }],
    ['a model', { model: 'opus' }],
    ['an effort', { effort: 'high' }],
    ['a group', { group: 'export-dialog' }],
    ['dependencies', { dependsOn: ['004'] }],
    ['epics', { epics: ['checkout'] }],
    ['network', { network: ['example.com'] }],
    ['an entity', { entity: 'web' }],
  ] as const)('a filing with %s is refused worker-filing-flag', (caseName, overrides) => {
    // Every case but the priority ones keeps `--priority low`, so the flag alone is what refuses it.
    const { priority: _lowPriority, ...withoutPriority } = lowFinding();
    const base    = caseName === 'no priority' ? withoutPriority : lowFinding();
    const command = { ...base, ...overrides } as ControlCommand;
    expect(Bouncer.verdictOf(jobOf('builder'), command)).toEqual({ verdict: 'refused', reason: 'worker-filing-flag' });
  });

  test('the filing past WORKER_FILINGS_PER_JOB is refused worker-filing-limit, the one before it admitted', () => {
    const filedTickets = Array.from({ length: WORKER_FILINGS_PER_JOB }, (_unused, index) => ({ id: String(index + 1).padStart(3, '0'), status: 'draft' as const }));
    expect(Bouncer.verdictOf(jobOf('builder', { filedTickets: filedTickets.slice(1) }), lowFinding()).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(jobOf('builder', { filedTickets }), lowFinding())).toEqual({ verdict: 'refused', reason: 'worker-filing-limit' });
  });

  test('every other command is refused for a worker', () => {
    expect(Bouncer.verdictOf(jobOf('builder'), EDIT_OF_TICKET_7)).toEqual({ verdict: 'refused', reason: 'command-not-allowed-for-role' });
    expect(Bouncer.verdictOf(jobOf('reviewer'), { kind: 'ticket-ready', ticketReferences: ['7'] }).verdict).toBe('refused');
  });

  // Merge approval is User's: no agent accepts its own branch or updates it past the Airlock.
  test('merge accept and merge update are refused for every role', () => {
    for (const role of ['builder', 'reviewer', 'product-owner', 'assistant'] as const) {
      for (const kind of ['merge-accept', 'merge-update'] as const) {
        expect(Bouncer.verdictOf(jobOf(role), { kind, ticketReference: '7' }).verdict, `${role} ${kind}`).toBe('refused');
      }
    }
  });
});

describe('the runtime commands', () => {
  // A clean restart of Talos stops every agent at its turn end: it is User's, from the live Overseer's API, never an agent's.
  test('talos-restart is refused for every agent role, the Assistant and the pipeline agent included', () => {
    const roles: readonly JobRole[] = ['builder', 'reviewer', 're-reviewer', 'conflict-re-reviewer', 'assistant', 'product-owner', 'pipeline-agent'];
    for (const role of roles) {
      expect(Bouncer.verdictOf(jobOf(role, { setupId: 'S1' }), { kind: 'talos-restart' }).verdict, role).toBe('refused');
    }
  });
});

describe('a job with no role', () => {
  test('a job with no role relays nothing', () => {
    expect(Bouncer.verdictOf(jobOf(null), lowFinding()).verdict).toBe('refused');
  });
});

describe('product-owner', () => {
  test('files at any priority, with --network, stamped with its job and no finding route', () => {
    const command = lowFinding({ priority: 'high', network: ['api.example.com'] });
    expect(Bouncer.verdictOf(jobOf('product-owner'), command)).toEqual({ verdict: 'admitted', command: { ...command, admission: { filedByJob: 'J12' } } });
  });

  test('edits its own draft, and not a draft another job filed or its own once readied', () => {
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'draft' }] }), EDIT_OF_TICKET_7).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '008', status: 'draft' }] }), EDIT_OF_TICKET_7))
      .toEqual({ verdict: 'refused', reason: 'not-own-draft' });
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'committed' }] }), EDIT_OF_TICKET_7))
      .toEqual({ verdict: 'refused', reason: 'not-own-draft' });
  });

  test('ticket-depends, epic-add and the draft kinds run on anything; ticket-ready never', () => {
    const job = jobOf('product-owner');
    expect(Bouncer.verdictOf(job, {
      kind: 'ticket-depends', ticketReference: '9', edit: 'add', ticketIds: ['010']
    }).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(job, {
      kind: 'epic-add', key: 'checkout', title: 'Checkout', bodyText: ''
    }).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(job, {
      kind: 'draft-note', draftId: 'D1', text: 'Assumed EUR.', noteKind: 'assumption'
    }).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(job, { kind: 'ticket-ready', ticketReferences: ['7'] })).toEqual({ verdict: 'refused', reason: 'command-not-allowed-for-role' });
    expect(Bouncer.verdictOf(job, { kind: 'concurrency-set', limit: 3 }).verdict).toBe('refused');
  });

  test.each<ControlCommandOf<'intake-close'> | ControlCommandOf<'intake-title'>>([
    { kind: 'intake-close', proposedDraftSets: [] },
    { kind: 'intake-title', title: 'Example basket' },
  ])('its $kind is admitted, stamped with its own job', (command) => {
    expect(Bouncer.verdictOf(jobOf('product-owner'), command)).toEqual({ verdict: 'admitted', command: { ...command, jobId: 'J12' } });
  });

  test('an intake-title naming a job of its own choosing is refused hatch-identity-mismatch', () => {
    expect(Bouncer.verdictOf(jobOf('product-owner'), { kind: 'intake-title', jobId: 'J1', title: 'Example basket' }))
      .toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test.each(['builder', 'reviewer', 'assistant'] as const)('a %s\'s intake-title is refused', (role) => {
    expect(Bouncer.verdictOf(jobOf(role), { kind: 'intake-title', title: 'Example basket' }).verdict).toBe('refused');
  });
});

describe('ticket entity', () => {
  const ASSIGNMENT_OF_TICKET_7: ControlCommandOf<'ticket-entity'> = {
    kind: 'ticket-entity', ticketReference: '#7', entity: 'web', reason: 'The basket page lives in the web app'
  };

  test('a product owner assigns the entity of its own draft and of any ticket ready for review or pending, stamped with its own job', () => {
    const admitted: BouncerVerdict = { verdict: 'admitted', command: { ...ASSIGNMENT_OF_TICKET_7, jobId: 'J12' } };
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'draft' }] }), ASSIGNMENT_OF_TICKET_7)).toEqual(admitted);
    expect(Bouncer.verdictOf(jobOf('product-owner', { ticketIdsReadyForReviewOrCommitted: ['005', '007'] }), ASSIGNMENT_OF_TICKET_7)).toEqual(admitted);
  });

  test('a draft another job filed, and a ticket neither its own draft nor ready for review or pending, are refused not-own-draft-or-unclaimed-ticket', () => {
    const refusedVerdict: BouncerVerdict = { verdict: 'refused', reason: 'not-own-draft-or-unclaimed-ticket' };
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '008', status: 'draft' }] }), ASSIGNMENT_OF_TICKET_7)).toEqual(refusedVerdict);
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'in-progress' }] }), ASSIGNMENT_OF_TICKET_7)).toEqual(refusedVerdict);
    expect(Bouncer.verdictOf(jobOf('product-owner', { ticketIdsReadyForReviewOrCommitted: ['008'] }), ASSIGNMENT_OF_TICKET_7)).toEqual(refusedVerdict);
  });

  test('an assignment naming a job of its own choosing is refused hatch-identity-mismatch, so no session words itself the product owner', () => {
    const forged = { ...ASSIGNMENT_OF_TICKET_7, jobId: 'J1' };
    expect(Bouncer.verdictOf(jobOf('product-owner', { ticketIdsReadyForReviewOrCommitted: ['007'] }), forged)).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test.each(['builder', 'reviewer', 'assistant', 'pipeline-agent'] as const)('a %s is refused it, whatever the ticket', (role) => {
    const job = jobOf(role, { filedTickets: [{ id: '007', status: 'draft' }], ticketIdsReadyForReviewOrCommitted: ['007'], setupId: 'S2' });
    expect(Bouncer.verdictOf(job, ASSIGNMENT_OF_TICKET_7).verdict).toBe('refused');
  });
});

describe('option notes', () => {
  const command: ControlCommandOf<'question-options'> = { kind: 'question-options', question: 'Which basket?', options: [{ label: 'Wicker' }] };

  test.each(['builder', 'reviewer', 'product-owner', 'pipeline-agent'] as const)('a %s\'s question-options is admitted, stamped with its own job', (role) => {
    expect(Bouncer.verdictOf(jobOf(role), command)).toEqual({ verdict: 'admitted', command: { ...command, jobId: 'J12' } });
  });

  test('question-options naming a job of its own choosing is refused hatch-identity-mismatch', () => {
    expect(Bouncer.verdictOf(jobOf('builder'), { ...command, jobId: 'J1' })).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test('an assistant, which never asks User, is refused its question-options', () => {
    expect(Bouncer.verdictOf(jobOf('assistant'), command).verdict).toBe('refused');
  });
});

describe('a need for another entity', () => {
  const NEED: ControlCommandOf<'need-declare'> = {
    kind:     'need-declare',
    entity:   'shared',
    title:    'Export the basket total',
    bodyText: '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n',
  };

  test('the builder of an entity\'s stage declares a complete need, stamped with its own job', () => {
    expect(Bouncer.verdictOf(jobOf('builder', { entity: 'web' }), NEED)).toEqual({ verdict: 'admitted', command: { ...NEED, jobId: 'J12' } });
  });

  test('a builder of a forge without entities, and a reviewer of an entity, are refused need-outside-an-entity', () => {
    expect(Bouncer.verdictOf(jobOf('builder'), NEED)).toEqual({ verdict: 'refused', reason: 'need-outside-an-entity' });
    expect(Bouncer.verdictOf(jobOf('reviewer', { entity: 'web' }), NEED)).toEqual({ verdict: 'refused', reason: 'need-outside-an-entity' });
  });

  test.each(['product-owner', 'pipeline-agent', 'assistant'] as const)('a %s is refused it', (role) => {
    expect(Bouncer.verdictOf(jobOf(role, { entity: 'web' }), NEED).verdict).toBe('refused');
  });

  test.each([
    ['a blank entity', { entity: ' ' }],
    ['a blank title', { title: '' }],
    ['no numbered Acceptance', { bodyText: '## Acceptance\n\nThe total.\n\n## Brief\n\nNeeded.\n' }],
    ['no Brief', { bodyText: '## Acceptance\n\nA1. The total.\n' }],
    ['a title that is no text', { title: 7 }],
  ] as const)('a need with %s is refused need-incomplete', (_caseName, overrides) => {
    const command = { ...NEED, ...overrides } as unknown as ControlCommand;
    expect(Bouncer.verdictOf(jobOf('builder', { entity: 'web' }), command)).toEqual({ verdict: 'refused', reason: 'need-incomplete' });
  });

  test('a need for a package whose change for the ticket is sealed is refused need-for-sealed-package (E42)', () => {
    expect(Bouncer.verdictOf(jobOf('builder', { entity: 'web', sealedPackages: ['shared'] }), NEED)).toEqual({ verdict: 'refused', reason: 'need-for-sealed-package' });
    expect(Bouncer.verdictOf(jobOf('builder', { entity: 'web', sealedPackages: ['ui-kit'] }), NEED)).toEqual({ verdict: 'admitted', command: { ...NEED, jobId: 'J12' } });
  });

  test('a need naming a job of its own choosing is refused hatch-identity-mismatch', () => {
    expect(Bouncer.verdictOf(jobOf('builder', { entity: 'web' }), { ...NEED, jobId: 'J1' })).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });
});

describe('pipeline agent', () => {
  const PIPELINE_AGENT_COMMANDS: readonly ControlCommand[] = [
    {
      kind: 'pipeline-finding-record', topic: 'scripts', label: 'Type check', value: 'bun run typecheck', sourcePaths: ['package.json'], script: null
    },
    {
      kind:        'pipeline-question-ask',
      step:        'research',
      subject:     null,
      question:    'Is the type check a gate?',
      context:     '',
      options:     ['Yes', 'No'],
      recommended: ['a'],
      multiple:    false,
    },
    { kind: 'pipeline-constitution-draft', markdown: '# Example Agency\n\n- Keep it small.\n', sources: [] },
    { kind: 'pipeline-draft-propose', edits: [{ field: 'review', value: { name: 'Review' }, summary: 'Review every ticket.' }] },
    { kind: 'pipeline-step-ready', step: 'research' },
  ];
  const ADMITTED_KINDS = new Set<string>([...PIPELINE_AGENT_COMMANDS.map((command) => command.kind), 'question-options']);
  const agent = jobOf('pipeline-agent', { ticketIds: [], setupId: 'S2' });

  test.each(PIPELINE_AGENT_COMMANDS.map((command) => [command.kind, command] as const))('%s is admitted, stamped with its job and its setup', (_kind, command) => {
    expect(Bouncer.verdictOf(agent, command)).toEqual({ verdict: 'admitted', command: { ...command, jobId: 'J12', setupId: 'S2' } as ControlCommand });
  });

  test('every other kind, each ticket verb among them, is refused command-not-allowed-for-role', () => {
    const otherKinds = CONTROL_COMMAND_KINDS.filter((kind) => !ADMITTED_KINDS.has(kind));
    expect(otherKinds).toContain('ticket-add');
    expect(otherKinds).toContain('pipeline-draft-edit');
    for (const kind of otherKinds) {
      const command = { kind } as unknown as ControlCommand;
      expect(Bouncer.verdictOf(agent, command), kind).toEqual({ verdict: 'refused', reason: 'command-not-allowed-for-role' });
    }
  });

  test('a request naming a setup of its own choosing is refused hatch-identity-mismatch', () => {
    const command: ControlCommand = { kind: 'pipeline-step-ready', setupId: 'S1', step: 'research' };
    expect(Bouncer.verdictOf(agent, command)).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test.each(PIPELINE_AGENT_COMMANDS.map((command) => [command.kind, command] as const))('%s of an entity\'s session is stamped with its entity too', (_kind, command) => {
    const entityAgent = jobOf('pipeline-agent', { ticketIds: [], setupId: 'S2', setupEntity: 'web' });
    expect(Bouncer.verdictOf(entityAgent, command)).toEqual({
      verdict: 'admitted',
      command: {
        ...command, jobId: 'J12', setupId: 'S2', entity: 'web'
      } as ControlCommand
    });
  });

  test('a request naming an entity of its own choosing is refused hatch-identity-mismatch', () => {
    const command: ControlCommand = { kind: 'pipeline-step-ready', entity: 'web', step: 'research' };
    expect(Bouncer.verdictOf(agent, command)).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test('an agent whose job serves no open setup record is refused job-serves-no-setup', () => {
    expect(Bouncer.verdictOf(jobOf('pipeline-agent'), { kind: 'pipeline-step-ready', step: 'research' })).toEqual({ verdict: 'refused', reason: 'job-serves-no-setup' });
  });

  test.each(['builder', 'reviewer', 'product-owner', 'assistant'] as const)('a %s is refused every pipeline agent move', (role) => {
    for (const command of PIPELINE_AGENT_COMMANDS) {
      expect(Bouncer.verdictOf(jobOf(role, { setupId: 'S2' }), command).verdict, command.kind).toBe('refused');
    }
  });
});

describe('ticket review', () => {
  const ROLES: readonly (JobRole | null)[] = ['builder', 'reviewer', 'product-owner', 'assistant', 'pipeline-agent', null];

  test('no Overseer-launched session relays ticket ready, ticket submit, a switch of ticket review or the Assistant\'s switch', () => {
    const commands: ControlCommand[] = [
      { kind: 'ticket-ready', ticketReferences: ['7'] },
      { kind: 'ticket-submit', ticketReferences: ['7'] },
      { kind: 'pipeline-approval-set', approval: 'tickets', on: false },
      { kind: 'pipeline-assistant-set', on: true },
      { kind: 'pipeline-assistant-set', on: false },
    ];
    for (const role of ROLES) {
      for (const command of commands) expect(Bouncer.verdictOf(jobOf(role), command).verdict, `${String(role)} ${command.kind}`).toBe('refused');
    }
  });

  test('a product owner edits or abandons its own ticket only while it is a draft, never once it is ready for review', () => {
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'ready-for-review' }] }), EDIT_OF_TICKET_7))
      .toEqual({ verdict: 'refused', reason: 'not-own-draft' });
  });
});

// Their verbs are refused under a job before anything relays; a request file written by hand must meet the same wall at the Overseer.
describe('the kinds only User\'s own surfaces send', () => {
  const ROLES: readonly (JobRole | null)[] = ['builder', 'reviewer', 'product-owner', 'assistant', 'pipeline-agent', null];
  const SYSTEM_QUESTION_ON_TICKET_7: RelayingJob['deliveredIncidents'][number] = {
    id: 'I9', kind: 'system-question', ticketIds: ['007'], jobId: 'J2'
  };

  test('no Overseer-launched session relays a resume of interrupted work, whatever its target', () => {
    const targets: ControlCommandOf<'interrupted-work-resume'>['target'][] = [{ jobId: 'J2' }, { ticketReference: '7' }, 'all', 'network-outage'];
    for (const role of [...JOB_ROLES, null]) {
      const job = jobOf(role, { deliveredIncidents: [SYSTEM_QUESTION_ON_TICKET_7] });
      for (const target of targets) {
        const verdict = Bouncer.verdictOf(job, { kind: 'interrupted-work-resume', target });
        expect(verdict.verdict, `${String(role)} ${JSON.stringify(target)}`).toBe('refused');
      }
    }
  });

  test('no Overseer-launched session relays range, clear, a by-hand delivery or an unready, not even naming a delivered incident', () => {
    const commands: ControlCommand[] = [
      { kind: 'chart-range-set', range: { kind: 'automatic' } },
      { kind: 'tracker-clear', scope: 'everything' },
      { kind: 'ticket-deliver-by-hand', ticketReference: '7' },
      { kind: 'ticket-unready', ticketReference: '7' },
    ];
    for (const role of ROLES) {
      const job = jobOf(role, { deliveredIncidents: [SYSTEM_QUESTION_ON_TICKET_7], filedTickets: [{ id: '007', status: 'draft' }] });
      for (const command of commands) {
        expect(Bouncer.verdictOf(job, { ...command, incidentId: 'I9' } as ControlCommand).verdict, `${String(role)} ${command.kind}`).toBe('refused');
      }
    }
  });
});

/** Design section 8.3's table, written out again so a drift on either side fails. */
const DESIGN_TABLE: Readonly<Record<IncidentKind, readonly IncidentMove[]>> = {
  'system-question':        ['incident-answer', 'incident-escalate', 'job-fresh', 'ticket-park', 'incident-note'],
  'malformed-ticket':       ['incident-answer', 'incident-escalate', 'ticket-park', 'incident-note'],
  'setup-failed':           ['worktree-repair', 'ticket-park', 'incident-note'],
  'out-of-calls':           ['job-fresh', 'ticket-park', 'incident-note'],
  'blocked':                ['job-fresh', 'worktree-repair', 'ticket-park', 'incident-note'],
  'job-lost':               ['job-fresh', 'ticket-park', 'incident-note'],
  'resume-failed':          ['job-fresh', 'ticket-park'],
  'gate-cannot-run':        ['gate-retry', 'worktree-repair', 'ticket-park'],
  'sandbox-unavailable':    ['gate-retry', 'ticket-park'],
  'quiet-job':              ['job-message', 'job-fresh', 'incident-note'],
  'setup-snapshot-touched': ['job-message', 'incident-note'],
};

/** A command of each move kind the contract has so far; the repair and merge moves arrive with their commands. */
const COMMAND_OF_MOVE: Partial<Record<IncidentMove, ControlCommand>> = {
  'incident-answer':   { kind: 'incident-answer', incidentId: 'I9', text: 'Use the example setup script' },
  'incident-escalate': { kind: 'incident-escalate', incidentId: 'I9' },
  'incident-note':     { kind: 'incident-note', incidentId: 'I9', text: 'Seen twice' },
  'job-fresh':         { kind: 'job-fresh', jobId: 'J2', incidentId: 'I9' },
  'job-message':       {
    kind: 'job-message', jobId: 'J2', text: 'Commit what you have.', incidentId: 'I9'
  },
  'ticket-park': {
    kind: 'ticket-park', ticketReference: '11', reason: 'Needs Alex Example', incidentId: 'I9'
  },
};

describe('ALLOWED_MOVES_BY_INCIDENT_KIND, the Bouncer\'s table', () => {
  test('is design section 8.3\'s table for all ten kinds, both ways', () => {
    expect(ALLOWED_MOVES_BY_INCIDENT_KIND).toEqual(DESIGN_TABLE);
    expect(Object.keys(ALLOWED_MOVES_BY_INCIDENT_KIND).sort()).toEqual([...INCIDENT_KINDS].sort());
  });

  test.each([...INCIDENT_KINDS])('a %s incident admits exactly the moves its row lists', (kind) => {
    for (const [move, command] of Object.entries(COMMAND_OF_MOVE)) {
      const incident = {
        id: 'I9', kind, ticketIds: ['011'], jobId: 'J2'
      };
      const verdict  = Bouncer.verdictOf(jobOf('assistant', { deliveredIncidents: [incident] }), command);
      expect(verdict.verdict, `${kind} ${move}`).toBe(DESIGN_TABLE[kind].includes(move as IncidentMove) ? 'admitted' : 'refused');
    }
  });

  test('job fresh under a question with no job waiting, as an Airlock report opens it, is refused', () => {
    const incident = {
      id: 'I9', kind: 'system-question' as const, ticketIds: ['011'], jobId: null
    };
    expect(Bouncer.verdictOf(jobOf('assistant', { deliveredIncidents: [incident] }), COMMAND_OF_MOVE['job-fresh'] ?? lowFinding()))
      .toEqual({ verdict: 'refused', reason: 'incident-move-not-allowed' });
  });
});

describe('assistant', () => {
  test('a move naming no delivered incident, ticket ready and a filing are refused', () => {
    const delivered = {
      deliveredIncidents: [{
        id: 'I5', kind: 'blocked' as const, ticketIds: ['011'], jobId: null
      }]
    };
    expect(Bouncer.verdictOf(jobOf('assistant', delivered), { kind: 'incident-note', incidentId: 'I6', text: 'Seen twice' }))
      .toEqual({ verdict: 'refused', reason: 'incident-move-not-allowed' });
    expect(Bouncer.verdictOf(jobOf('assistant', delivered), { kind: 'ticket-ready', ticketReferences: ['11'] }))
      .toEqual({ verdict: 'refused', reason: 'incident-move-not-allowed' });
    expect(Bouncer.verdictOf(jobOf('assistant', delivered), lowFinding()).verdict).toBe('refused');
  });
});

describe('an incident move\'s target is the incident\'s own', () => {
  const OWN_INCIDENT = {
    id: 'I9', kind: 'quiet-job' as const, ticketIds: ['011'], jobId: 'J2'
  };
  const FAILED_RESUME = { ...OWN_INCIDENT, kind: 'resume-failed' as const };

  function verdictUnder(incident: RelayingJob['deliveredIncidents'][number], command: ControlCommand) {
    return Bouncer.verdictOf(jobOf('assistant', { deliveredIncidents: [incident] }), command);
  }

  test.each([
    ['job fresh', OWN_INCIDENT, { kind: 'job-fresh', incidentId: 'I9' }, { jobId: 'J2' }, { jobId: 'J3' }],
    ['job message', OWN_INCIDENT, { kind: 'job-message', text: 'Commit what you have.', incidentId: 'I9' }, { jobId: 'J2' }, { jobId: 'J3' }],
    ['ticket park', FAILED_RESUME, { kind: 'ticket-park', reason: 'Needs Alex Example', incidentId: 'I9' }, { ticketReference: '#11' }, { ticketReference: '12' }],
  ] as const)('%s naming the incident\'s own is admitted, naming another is refused incident-target-mismatch', (_move, incident, command, own, another) => {
    const ownCommand = { ...command, ...own } as ControlCommand;
    expect(verdictUnder(incident, ownCommand)).toEqual({ verdict: 'admitted', command: ownCommand });
    expect(verdictUnder(incident, { ...command, ...another } as ControlCommand)).toEqual({ verdict: 'refused', reason: 'incident-target-mismatch' });
  });

  test('a job message under an incident with no job, and a park under one with no tickets, are refused incident-target-mismatch', () => {
    expect(verdictUnder({ ...OWN_INCIDENT, jobId: null }, COMMAND_OF_MOVE['job-message'] ?? lowFinding()))
      .toEqual({ verdict: 'refused', reason: 'incident-target-mismatch' });
    expect(verdictUnder({ ...FAILED_RESUME, ticketIds: [] }, COMMAND_OF_MOVE['ticket-park'] ?? lowFinding()))
      .toEqual({ verdict: 'refused', reason: 'incident-target-mismatch' });
  });

  test('a gate retry under a gate-cannot-run incident with no job, as a gate run outside the Airlock opens it, is admitted', () => {
    const regateIncident = {
      id: 'I9', kind: 'gate-cannot-run' as const, ticketIds: ['011'], jobId: null
    };
    const command: ControlCommand = { kind: 'gate-retry', jobId: 'J2', incidentId: 'I9' };
    expect(verdictUnder(regateIncident, command)).toEqual({ verdict: 'admitted', command });
  });

  test('a park whose reference is no ticket id is refused incident-target-mismatch', () => {
    const command: ControlCommand = {
      kind: 'ticket-park', ticketReference: 'eleven', reason: 'Needs Alex Example', incidentId: 'I9'
    };
    expect(verdictUnder(FAILED_RESUME, command)).toEqual({ verdict: 'refused', reason: 'incident-target-mismatch' });
  });

  test('the kind guard goes first: a move the kind does not allow stays incident-move-not-allowed on any target', () => {
    const elsewhere: ControlCommand = {
      kind: 'ticket-park', ticketReference: '12', reason: 'Needs Alex Example', incidentId: 'I9'
    };
    expect(verdictUnder(OWN_INCIDENT, elsewhere)).toEqual({ verdict: 'refused', reason: 'incident-move-not-allowed' });
  });
});

describe('identity comes from the job record, never from the request', () => {
  test.each(['role', 'jobId'])('a command carrying a forged %s is refused hatch-identity-mismatch', (field) => {
    const forged = { ...lowFinding(), [field]: field === 'role' ? 'product-owner' : 'J1' } as ControlCommand;
    expect(Bouncer.verdictOf(jobOf('builder'), forged)).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test('a command carrying its own admission is refused hatch-identity-mismatch', () => {
    const forged = lowFinding({ admission: { filedByJob: 'J1', finderTicketIds: [] } });
    expect(Bouncer.verdictOf(jobOf('builder'), forged)).toEqual({ verdict: 'refused', reason: 'hatch-identity-mismatch' });
  });

  test('a product owner\'s request dropped into a builder\'s folder is judged as the builder\'s, and refused', () => {
    const productOwnerEdit: ControlCommand = { kind: 'ticket-priority', ticketReference: '7', priority: 'high' };
    expect(Bouncer.verdictOf(jobOf('product-owner', { filedTickets: [{ id: '007', status: 'draft' }] }), productOwnerEdit).verdict).toBe('admitted');
    expect(Bouncer.verdictOf(jobOf('builder', { id: 'J13' }), productOwnerEdit)).toEqual({ verdict: 'refused', reason: 'command-not-allowed-for-role' });
  });
});
