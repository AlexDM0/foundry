/**
 * Every command kind a shipping Bridge file sends is in the contract: in `CONTROL_CONTRACT_KINDS` or `BOARD_COMMAND_CONTRACT_KINDS`, so a
 * view moved to another client sends only what forge keeps. A kind sent is the value of a `kind` property in an object literal, both
 * branches of a conditional of two string literals included, that names one of forge's command kinds; a `case` label naming a log
 * record is no kind sent. Kinds are read from the syntax tree. The scan first proves it found a floor of kinds, the pause in the header
 * among them, and each form is planted in memory.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { CONTROL_COMMAND_KINDS, FLINT_BRAIN_COMMAND_KINDS }       from '../src/services/control/ControlService.ts';
import { BOARD_COMMAND_CONTRACT_KINDS, CONTROL_CONTRACT_KINDS } from '../src/shared/constants/OverseerApiContracts.ts';

interface BridgeSource {
  readonly path: string;
  readonly text: string;
}

const BRIDGE_FOLDER = import.meta.dir;
const SMALLEST_SENT_KIND_COUNT = 30;
const SKIPPED_FOLDERS: readonly string[] = ['testing', 'node_modules', '.forge-worktrees', '.forge', '.claude'];

const FORGE_COMMAND_KINDS: ReadonlySet<string> = new Set([...CONTROL_COMMAND_KINDS, ...FLINT_BRAIN_COMMAND_KINDS]);
const CONTRACT_KINDS: ReadonlySet<string> = new Set([...CONTROL_CONTRACT_KINDS, ...BOARD_COMMAND_CONTRACT_KINDS]);

function isShippingSource(path: string): boolean {
  if (path.split('/').some((folder) => SKIPPED_FOLDERS.includes(folder))) return false;
  return /\.tsx?$/.test(path) && !path.endsWith('.spec.ts') && !path.endsWith('.dom.tsx');
}

function shippingSources(): BridgeSource[] {
  return readdirSync(BRIDGE_FOLDER, { recursive: true, encoding: 'utf8' })
    .filter(isShippingSource)
    .sort()
    .map((path) => ({ path, text: readFileSync(join(BRIDGE_FOLDER, path), 'utf8') }));
}

function literalKindsOf(initializer: ts.Expression): string[] {
  if (ts.isStringLiteralLike(initializer)) return [initializer.text];
  if (ts.isConditionalExpression(initializer) && ts.isStringLiteralLike(initializer.whenTrue) && ts.isStringLiteralLike(initializer.whenFalse)) {
    return [initializer.whenTrue.text, initializer.whenFalse.text];
  }
  return [];
}

/** Each forge command kind the source sends, as `<kind> in <path>`. */
function sentKindsOf(source: BridgeSource): { kind: string; path: string }[] {
  const scriptKind = source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, scriptKind);
  const sent: { kind: string; path: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent) && ts.isIdentifier(node.name) && node.name.text === 'kind') {
      for (const kind of literalKindsOf(node.initializer)) {
        if (FORGE_COMMAND_KINDS.has(kind)) sent.push({ kind, path: source.path });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return sent;
}

function kindsOutsideTheContractOf(sources: readonly BridgeSource[]): string[] {
  return sources.flatMap(sentKindsOf).filter(({ kind }) => !CONTRACT_KINDS.has(kind)).map(({ kind, path }) => `${path} sends ${kind}, which is in no contract`);
}

describe('the Bridge sends only kinds of the contract', () => {
  const sources = shippingSources();
  const sentKinds = new Set(sources.flatMap(sentKindsOf).map(({ kind }) => kind));

  test('the scan reads the Bridge\'s shipping sources and finds the kinds they send', () => {
    expect(sources.map((source) => source.path)).toContain(join('shell', 'Header.tsx'));
    expect(sentKinds.has('overseer-pause')).toBe(true);
    expect(sentKinds.size).toBeGreaterThanOrEqual(SMALLEST_SENT_KIND_COUNT);
  });

  test('every kind a shipping file sends is in the control contract or the board commands of the contract', () => {
    expect(kindsOutsideTheContractOf(sources)).toEqual([]);
  });

  test('a planted file sending a kind outside the contract is refused, and a case label of a log record passes', () => {
    expect(kindsOutsideTheContractOf([
      { path: 'views/Planted.tsx', text: 'export const command = { kind: \'ticket-add\', title: \'Example\' };' },
      { path: 'views/PlantedLog.ts', text: 'export function wordOf(kind: string): string { switch (kind) { case \'pipeline-gates-none\': return \'none\'; default: return kind; } }' },
      { path: 'views/PlantedChoice.ts', text: 'export const command = (paused: boolean) => ({ kind: paused ? \'overseer-resume\' : \'overseer-pause\' });' },
    ])).toEqual(['views/Planted.tsx sends ticket-add, which is in no contract']);
  });
});
