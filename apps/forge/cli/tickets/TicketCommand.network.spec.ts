/**
 * A ticket's `network` line: set, cleared and logged, a domain that is not public refused, legal only while draft or committed, carried in
 * `--json`, and a cleared ticket byte-identical to one that never had it.
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

function contextHere(): ReturnType<typeof createCapturedCommandContext> {
  return createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
}

async function runWithExitCode(commandLineArguments: readonly string[], expectedExitCode: number): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = contextHere();
  const exitCode = await runCommandLineWithHephaestusMoves(commandLineArguments, context);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\`: ${context.errorText()}`).toBe(expectedExitCode);
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
  repositoryDirectory = await createInitializedRecordedGitRepository('ticket-network', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('a ticket network line', () => {
  test('ticket add --network stores the domains lower case and logs the filing, then the line', async () => {
    const context = await run(['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates', '--network', 'API.example.com,cdn.example.com']);

    expect(storedTicketText('001')).toContain('network: "api.example.com, cdn.example.com"');
    expect(context.outputText()).toContain('Ticket #001 network: api.example.com, cdn.example.com');
    expect(storedLogEntriesOf(repositoryDirectory).map((entry) => entry.text).slice(-2))
      .toEqual(['Ticket #001 filed: Fetch the exchange rates', 'Ticket #001 network: api.example.com, cdn.example.com']);
  });

  test('ticket network sets it and --clear leaves the file byte for byte as one that never had it', async () => {
    await run(['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates']);
    const neverSet = storedTicketText('001');

    await run(['ticket', 'network', '1', 'api.example.com', 'cdn.example.com']);
    expect(storedTicketText('001')).toContain('network: "api.example.com, cdn.example.com"');

    await run(['ticket', 'network', '1', '--clear']);
    expect(storedTicketText('001')).toBe(neverSet);
    expect(storedLogEntriesOf(repositoryDirectory).at(-1)?.text).toBe('Ticket #001 needs no network');
  });

  test('status --json and ticket show --json carry the line once set, and neither carries it before', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates']);
    const shownBefore = JSON.parse((await run(['ticket', 'show', '1', '--json'])).outputText()) as Record<string, unknown>;
    expect(shownBefore).not.toHaveProperty('network');

    await run(['ticket', 'network', '1', 'api.example.com']);

    const shown  = JSON.parse((await run(['ticket', 'show', '1', '--json'])).outputText()) as { network: string[] };
    const status = JSON.parse((await run(['status', '--json'])).outputText()) as { tickets: Array<{ network?: string[] }> };
    expect(shown.network).toEqual(['api.example.com']);
    expect(status.tickets.map((ticket) => ticket.network)).toEqual([['api.example.com']]);
  });

  test.each([
    ['a loopback name', 'localhost'],
    ['a name under localhost', 'api.localhost'],
    ['a .local name', 'printer.local'],
    ['an IPv4 loopback literal', '127.0.0.1'],
    ['a private IPv4 literal', '192.168.1.10'],
    ['an IPv6 loopback literal', '::1'],
  ])('%s is refused network-domain-not-public at exit 1, on add and on ticket network, with nothing written', async (_form, domain) => {
    const filingRefusal = await runWithExitCode(['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates', '--network', domain], 1);
    expect(filingRefusal.errorText()).toContain(`${domain} is not a public domain`);
    expect(readdirSync(ticketRecordsFolder())).toEqual([]);

    await run(['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates']);
    const before  = storedTicketText('001');
    const refusal = await runWithExitCode(['ticket', 'network', '1', 'api.example.com', domain], 1);
    expect(refusal.errorText()).toContain(`${domain} is not a public domain`);
    expect(storedTicketText('001')).toBe(before);
  });

  test('a ticket past committed is refused at exit 1, and domains beside --clear are refused as ambiguous', async () => {
    await fileReadyTicket(run, ['ticket', 'add', '--type', 'ticket', 'Fetch the exchange rates']);
    await run(['ticket', 'start', '1']);
    const before = storedTicketText('001');

    expect((await runWithExitCode(['ticket', 'network', '1', 'api.example.com'], 1)).errorText()).toContain('set only while the ticket is draft or committed');
    expect((await runWithExitCode(['ticket', 'network', '1', 'api.example.com', '--clear'], 1)).errorText()).toContain('its domains or --clear, not both');
    expect(storedTicketText('001')).toBe(before);
  });
});
