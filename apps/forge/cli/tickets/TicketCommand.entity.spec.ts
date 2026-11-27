/**
 * A ticket's entity as the command surface of a forge without entities sees it. The cases that matter: `ticket entity` and
 * `ticket add --entity` are refused at exit 1 with nothing written, since the pipeline names no entity; `ticket entity` without its
 * reason, its key or its ticket is refused by its usage; and `ticket ready` readies a draft with no entity exactly as before, the ticket
 * file and the log gaining no entity. What a forge with entities does is held where the pipeline can name them, in
 * `src/services/control/TicketControls.spec.ts` and `src/domain/tracker-model/Board.ticketSettings.spec.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join }                      from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
}                                             from 'bun:test';
import { PRODUCT_NAMES }                          from '../../src/shared/constants/ProductNames.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { runCommandLineWithHephaestusMoves }      from '../testing/HephaestusTicketMoves.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicket }                        from '../testing/ReadyTicketFiling.ts';
import { storedLogEntriesOf }                     from '../testing/StoredLogEntries.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[], expectedExitCode: number): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`${PRODUCT_NAMES.PROGRAM} ${commandLineArguments.join(' ')}\`: ${context.errorText()}`).toBe(expectedExitCode);
  return context;
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  return await runWithExitCode(commandLineArguments, 0);
}

function ticketRecordsFolder(): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'tickets');
}

function storedTicketText(identifier: string): string {
  const fileName = readdirSync(ticketRecordsFolder()).find((name) => name.startsWith(`${identifier}-`));
  if (fileName === undefined) throw new Error(`no ticket file for #${identifier}`);
  return readFileSync(join(ticketRecordsFolder(), fileName), 'utf8');
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('ticket-entity', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('a ticket entity in a forge without entities', () => {
  test('ticket entity is refused unknown-entity at exit 1, naming no entity, with the ticket and the log as they were', async () => {
    await run(['ticket', 'add', '--type', 'ticket', 'Keep the basket']);
    const ticketBefore = storedTicketText('001');
    const logBefore    = storedLogEntriesOf(repositoryDirectory);

    const refusal = await runWithExitCode(['ticket', 'entity', '1', 'web', '--reason', 'The basket page lives in the web app'], 1);

    expect(refusal.errorText()).toContain('Ticket #001 was not given the entity web: the pipeline names no entity. Nothing was written.');
    expect(storedTicketText('001')).toBe(ticketBefore);
    expect(storedLogEntriesOf(repositoryDirectory)).toEqual(logBefore);
  });

  test('ticket add --entity is refused at exit 1 before the ticket is filed', async () => {
    const refusal = await runWithExitCode(['ticket', 'add', '--type', 'ticket', 'Keep the basket', '--entity', 'web'], 1);

    expect(refusal.errorText()).toContain('the pipeline names no entity');
    expect(readdirSync(ticketRecordsFolder())).toEqual([]);
  });

  test.each([
    ['no reason', ['ticket', 'entity', '1', 'web']],
    ['no key', ['ticket', 'entity', '1', '--reason', 'The basket page lives in the web app']],
    ['no ticket', ['ticket', 'entity']],
  ])('ticket entity with %s is refused by its usage at exit 1', async (_case, commandLineArguments) => {
    await run(['ticket', 'add', '--type', 'ticket', 'Keep the basket']);
    const refusal = await runWithExitCode(commandLineArguments, 1);
    expect(refusal.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} ticket entity needs a ticket id, an entity key and --reason.`);
    expect(refusal.errorText()).toContain('entity <id> <key> --reason <text> [--at <when>] [--json]');
  });

  test('ticket ready readies a draft with no entity as before, and the file and the log gain no entity', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Keep the basket']);

    expect(storedTicketText('001')).toContain('status: "committed"');
    expect(storedTicketText('001')).not.toContain('entity');
    expect(storedLogEntriesOf(repositoryDirectory).map((entry) => entry.text).some((text) => text.includes('entity'))).toBe(false);
  });
});
