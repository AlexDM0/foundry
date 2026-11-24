/**
 * The programs a forge's agents may run: those its pipeline's prepare steps and gates run, or the list User kept, each found in the
 * places installers put programs; git always. Their folders make an agent's search path, the system's folders after them.
 */
import type { ExecutableResolver }     from '../../lib/executable-resolver/ExecutableResolver.ts';
import type { ToolSearch }             from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import type { ShellLine }              from '../../lib/shell-line/ShellLine.ts';
import type { Pipeline, PipelineTool } from '../../lib/tracker-model/@types/Pipeline.ts';
import type { ToolFacts, ToolUse }     from '../../shared/@types/AgentFacts.ts';

export const ALWAYS_APPROVED_TOOL = 'git';

/** The shell's own words, which run no program of the machine. */
const SHELL_WORDS: ReadonlySet<string> = new Set([
  '.',
  ':',
  '[',
  '[[',
  '!',
  '{',
  '}',
  'alias',
  'case',
  'cd',
  'command',
  'do',
  'done',
  'echo',
  'elif',
  'else',
  'esac',
  'eval',
  'exec',
  'exit',
  'export',
  'false',
  'fi',
  'for',
  'if',
  'printf',
  'pwd',
  'read',
  'set',
  'shift',
  'source',
  'test',
  'then',
  'trap',
  'true',
  'type',
  'ulimit',
  'umask',
  'unset',
  'until',
  'wait',
  'while',
]);

/** A bare program name: a path or a variable runs what the line names, which is no tool to find. */
function isAToolName(word: string): boolean {
  return word !== '' && !/[\\/$`"'=]/.test(word) && !SHELL_WORDS.has(word);
}

function addUse(uses: Map<string, ToolUse[]>, name: string, use: ToolUse): void {
  const known = uses.get(name) ?? [];
  if (!known.some((existing) => JSON.stringify(existing) === JSON.stringify(use))) known.push(use);
  uses.set(name, known);
}

/** Each program the prepare steps and gates name, a gate's fix included, with where each runs it, in the order the pipeline lists them. */
function toolUsesOf(pipeline: Readonly<Pipeline> | null, shellLine: ShellLine): Map<string, ToolUse[]> {
  const uses = new Map<string, ToolUse[]>([[ALWAYS_APPROVED_TOOL, [{ kind: 'every-job' }]]]);
  if (pipeline === null) return uses;
  const levels = [
    { entity: null, prepare: pipeline.prepare, gates: pipeline.gates },
    ...Object.entries(pipeline.entities ?? {}).map(([entity, entityPipeline]) => ({ entity, prepare: entityPipeline.prepare, gates: entityPipeline.gates })),
  ];
  for (const { entity, prepare, gates } of levels) {
    for (const step of prepare) {
      for (const word of shellLine.executablesOf(step.run).filter(isAToolName)) addUse(uses, word, { kind: 'prepare', name: step.name, entity });
    }
    for (const gate of gates) {
      const lines = gate.fix === undefined ? [gate.run] : [gate.run, gate.fix];
      for (const word of lines.flatMap((line) => shellLine.executablesOf(line)).filter(isAToolName)) addUse(uses, word, { kind: 'gate', name: gate.name, entity });
    }
  }
  return uses;
}

/** The first path the search gives that holds a program of that name, as found there; `null` when none does. */
function foundPathOf(name: string, search: ToolSearch, resolver: ExecutableResolver): string | null {
  for (const path of search.pathsOf(name)) {
    const program = resolver.programAt(path, []);
    if (program.verdict === 'found') return program.path;
  }
  return null;
}

/**
 * Every tool a view lists: the pipeline's programs, each found now, and the forge's own list where it keeps one, each at its kept path;
 * a program the pipeline names that the list leaves out is listed unapproved. git is always approved.
 */
function toolFactsOf(pipeline: Readonly<Pipeline> | null, shellLine: ShellLine, search: ToolSearch, resolver: ExecutableResolver): ToolFacts[] {
  const uses = toolUsesOf(pipeline, shellLine);
  const kept = pipeline?.tools;
  const listed = kept === undefined ? [] : kept.filter((tool) => !uses.has(tool.name)).map((tool) => tool.name);
  return [...uses.keys(), ...listed].map((name) => {
    const keptTool = kept?.find((tool) => tool.name === name);
    const path = keptTool === undefined ? foundPathOf(name, search, resolver) : resolver.programAt(keptTool.path, []).verdict === 'found' ? keptTool.path : null;
    const approved = name === ALWAYS_APPROVED_TOOL || kept === undefined ? path !== null : keptTool !== undefined;
    return {
      name, path, approved, usedBy: uses.get(name) ?? []
    };
  });
}

/** The tools a launch puts on the agent's search path: the approved ones that were found, git's own path where the forge lists none for it. */
function launchToolsOf(
  pipeline: Readonly<Pipeline> | null,
  shellLine: ShellLine,
  search: ToolSearch,
  resolver: ExecutableResolver,
  gitPath: string | null,
): PipelineTool[] {
  const facts = toolFactsOf(pipeline, shellLine, search, resolver);
  const approved = facts.flatMap((tool) => (tool.approved && tool.path !== null ? [{ name: tool.name, path: tool.path }] : []));
  return gitPath === null || approved.some((tool) => tool.name === ALWAYS_APPROVED_TOOL) ? approved : [{ name: ALWAYS_APPROVED_TOOL, path: gitPath }, ...approved];
}

export const AgentTools = Object.freeze({
  toolUsesOf, foundPathOf, toolFactsOf, launchToolsOf
});
