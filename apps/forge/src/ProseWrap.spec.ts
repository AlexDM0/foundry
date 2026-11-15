/**
 * The prose wrap reviewers hold: a paragraph line of the repository's rules, root and path-scoped, the design system's constitution, skills,
 * installed templates and CLI reference is at most 120 columns; the path-scoped rules are the workspace root's, the constitution the
 * package's. Table rows, fenced code, frontmatter and a line holding one code span alone are left alone, since none can wrap. The scan
 * first proves it read paragraph lines of every file, and each form is planted to prove the guard names it and passes what it skips.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                        from './testing/ImportGraph.ts';
import type { ProgramFile }                                    from './testing/RepositorySources.ts';
import { declaredWorkspacePackagesOf, workspaceRootOfProgram } from './testing/RepositorySources.ts';

const PROSE_WIDTH_COLUMNS = 120;
const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const LONE_CODE_SPAN = /^\s*(— )?`[^`]+`[.,;:]?$/;
const FRONTMATTER_FENCE = '---';

const DESIGN_SYSTEM_PACKAGE = 'design-system';
const CONSTITUTION_FILE = 'CONSTITUTION.md';

function filesGlobbedIn(root: string, patterns: readonly string[]): ProgramFile[] {
  return patterns.flatMap((pattern) => [...new Bun.Glob(pattern).scanSync({ cwd: root, dot: true })])
    .map((path) => ({ path, location: join(root, path) }));
}

function wrappedProseFilesOf(programRoot: string): ProgramFile[] {
  const designSystemFolder = declaredWorkspacePackagesOf(programRoot).find(({ name }) => name === DESIGN_SYSTEM_PACKAGE)?.folder ?? '';
  const globbed = [
    ...filesGlobbedIn(workspaceRootOfProgram(programRoot), ['.claude/rules/*.md']),
    ...filesGlobbedIn(programRoot, ['skills/**/*.md', 'resources/templates/*.md', 'resources/prompts/*.md']),
  ].sort((a, b) => a.path.localeCompare(b.path));
  return [
    { path: 'CLAUDE.md', location: join(programRoot, 'CLAUDE.md') },
    { path: `${DESIGN_SYSTEM_PACKAGE}/${CONSTITUTION_FILE}`, location: join(designSystemFolder, CONSTITUTION_FILE) },
    ...filesGlobbedIn(programRoot, ['docs/cli.md', 'docs/backlog.md']),
    ...globbed,
  ];
}

function paragraphLineNumbersOf(text: string): number[] {
  const lines = text.split('\n');
  const paragraphLineNumbers: number[] = [];
  let insideFence = false;
  let insideFrontmatter = lines[0] === FRONTMATTER_FENCE;
  lines.forEach((line, index) => {
    if (insideFrontmatter) {
      insideFrontmatter = index === 0 || line !== FRONTMATTER_FENCE;
      return;
    }
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      return;
    }
    if (!insideFence && !TABLE_ROW.test(line) && !LONE_CODE_SPAN.test(line) && line.trim() !== '') paragraphLineNumbers.push(index + 1);
  });
  return paragraphLineNumbers;
}

function overlongProseLinesOf(path: string, text: string): string[] {
  const lines = text.split('\n');
  return paragraphLineNumbersOf(text)
    .filter((lineNumber) => (lines[lineNumber - 1] ?? '').length > PROSE_WIDTH_COLUMNS)
    .map((lineNumber) => `${path}:${lineNumber} is ${(lines[lineNumber - 1] ?? '').length} columns`);
}

const PROSE_FILES = wrappedProseFilesOf(repositoryRootOfThisCheckout()).map(({ path, location }) => ({ path, text: readFileSync(location, 'utf8') }));

describe('prose wraps at 120 columns', () => {
  test('the scan reads paragraph lines of the rules, the design system\'s constitution, both skills, the templates, the reference and the overseer\'s prompts', () => {
    for (const expectedPath of ['CLAUDE.md',
      '.claude/rules/bridge.md',
      '.claude/rules/design-system.md',
      '.claude/rules/flint.md',
      '.claude/rules/skills.md',
      'design-system/CONSTITUTION.md',
      'docs/cli.md',
      'skills/agent-po/SKILL.md',
      'skills/agent-progress-orchestrate/SKILL.md',
      'resources/templates/SessionInstructions.md',
      'resources/templates/Reference.md',
      'resources/prompts/BuildPrompt.md',
      'resources/prompts/WindDownMessage.md']) {
      const file = PROSE_FILES.find((prose) => prose.path === expectedPath);
      expect(paragraphLineNumbersOf(file?.text ?? '').length, expectedPath).toBeGreaterThan(0);
    }
  });

  test('no paragraph line in those files runs past 120 columns', () => {
    expect(PROSE_FILES.flatMap((file) => overlongProseLinesOf(file.path, file.text))).toEqual([]);
  });

  const overlong = 'word '.repeat(PROSE_WIDTH_COLUMNS / 'word '.length + 1);

  test.each([
    ['a paragraph line', `Intro.\n${overlong}\n`],
    ['a list item', `- ${overlong}\n`],
    ['a line after a closed fence', `\`\`\`\ncode\n\`\`\`\n${overlong}\n`],
    ['a line after the frontmatter', `---\nname: example\n---\n${overlong}\n`],
  ])('a planted overlong %s is named', (_form, plantedText) => {
    expect(overlongProseLinesOf('Planted.md', plantedText)).toEqual([expect.stringContaining('Planted.md:')]);
  });

  test('a table row, fenced code, frontmatter and a lone code span pass however long', () => {
    const plantedText = `---\ndescription: ${overlong}\n---\n| ${overlong} |\n\`\`\`\n${overlong}\n\`\`\`\n  \`${overlong}\`.\nShort.\n`;
    expect(overlongProseLinesOf('Planted.md', plantedText)).toEqual([]);
  });
});
