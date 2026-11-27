/**
 * The programs a forge's agents, gates and prepare steps may run: those its pipeline's prepare steps and gates run, or the list User kept,
 * each found in the places installers put programs and never inside a forbidden root; git always. Their folders make the search path, the
 * system's folders after them.
 */
import { dirname } from 'node:path';

import type { Pipeline, PipelineTool }        from '../../domain/tracker-model/@types/Pipeline.ts';
import type { ExecutableResolver }            from '../../lib/executable-resolver/ExecutableResolver.ts';
import type { PlatformPorts }                 from '../../lib/platform-ports/PlatformPortsFor.ts';
import { ProgramSearchUtil, type ToolSearch } from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import type { ShellLine }                     from '../../lib/shell-line/ShellLine.ts';
import type { ToolFacts, ToolUse }            from '../../shared/@types/AgentFacts.ts';
import { agentToolForbiddenRootsOf }          from '../tracker/RegisteredRepositoryRoots.ts';

/** What names the tools: the steps and gates of a pipeline, a draft or a check, and the list User kept, where there is one. */
export type ToolNamingSteps = Pick<Pipeline, 'prepare' | 'gates' | 'entities' | 'tools'>;

/** Where tools are found and judged: the shell that reads the lines, the search, the resolver, and the roots no tool may lie in. */
export interface ToolPlaces {
  readonly shellLine:      ShellLine;
  readonly search:         ToolSearch;
  readonly resolver:       ExecutableResolver;
  readonly forbiddenRoots: readonly string[];
}

/** A kept tool a launch leaves off the search path, with the resolver's reason. */
export interface RefusedTool {
  readonly name:   string;
  readonly path:   string;
  readonly reason: string;
}

export interface LaunchTools {
  readonly tools:        PipelineTool[];
  readonly refusedTools: RefusedTool[];
}

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
function toolUsesOf(pipeline: Readonly<ToolNamingSteps> | null, shellLine: ShellLine): Map<string, ToolUse[]> {
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

/** The first path the search gives that holds a program of that name outside the forbidden roots, as found there; `null` when none does. */
function foundPathOf(name: string, search: ToolSearch, resolver: ExecutableResolver, forbiddenRoots: readonly string[]): string | null {
  for (const path of search.pathsOf(name)) {
    const program = resolver.programAt(path, forbiddenRoots);
    if (program.verdict === 'found') return program.path;
  }
  return null;
}

/**
 * Every tool a view lists: the pipeline's programs, each found now, and the forge's own list where it keeps one, each at its kept path;
 * a program the pipeline names that the list leaves out is listed unapproved, and a kept path inside a forbidden root as not found. git is
 * always approved.
 */
function toolFactsOf(pipeline: Readonly<ToolNamingSteps> | null, places: ToolPlaces): ToolFacts[] {
  const {
    shellLine, search, resolver, forbiddenRoots
  } = places;
  const uses = toolUsesOf(pipeline, shellLine);
  const kept = pipeline?.tools;
  const listed = kept === undefined ? [] : kept.filter((tool) => !uses.has(tool.name)).map((tool) => tool.name);
  return [...uses.keys(), ...listed].map((name) => {
    const keptTool = kept?.find((tool) => tool.name === name);
    const path = keptTool === undefined
      ? foundPathOf(name, search, resolver, forbiddenRoots)
      : resolver.programAt(keptTool.path, forbiddenRoots).verdict === 'found' ? keptTool.path : null;
    const approved = name === ALWAYS_APPROVED_TOOL || kept === undefined ? path !== null : keptTool !== undefined;
    return {
      name, path, approved, usedBy: uses.get(name) ?? []
    };
  });
}

/** The kept tools whose path lies inside a forbidden root, which no launch puts on its search path. */
function refusedToolsOf(pipeline: Readonly<ToolNamingSteps> | null, places: ToolPlaces): RefusedTool[] {
  return (pipeline?.tools ?? []).flatMap((tool) => {
    const program = places.resolver.programAt(tool.path, places.forbiddenRoots);
    return program.verdict === 'refused' && program.cause === 'inside-forbidden-root' ? [{ name: tool.name, path: tool.path, reason: program.reason }] : [];
  });
}

/** The tools a launch, a gate or a prepare step puts on its search path: the approved ones that were found, and the kept ones it refused. */
function launchToolsOf(pipeline: Readonly<ToolNamingSteps> | null, places: ToolPlaces): LaunchTools {
  const tools = toolFactsOf(pipeline, places).flatMap((tool) => (tool.approved && tool.path !== null ? [{ name: tool.name, path: tool.path }] : []));
  return { tools, refusedTools: refusedToolsOf(pipeline, places) };
}

/** The places of this machine, the tools looked for in the folders installers use under `homeDirectory`. */
function toolPlacesOf(
  platformPorts: Pick<PlatformPorts, 'shellLine' | 'programFolders' | 'executableResolver'>, homeDirectory: string, forbiddenRoots: readonly string[],
): ToolPlaces {
  return {
    shellLine: platformPorts.shellLine,
    search:    ProgramSearchUtil.toolSearchOf(platformPorts.programFolders, homeDirectory),
    resolver:  platformPorts.executableResolver,
    forbiddenRoots,
  };
}

/** The machine and the forge a launch's tools are found for: the forge's tracker folder and this machine's monitor folder. */
export interface ToolForge {
  readonly platformPorts: Pick<PlatformPorts, 'shellLine' | 'programFolders' | 'executableResolver'>;
  readonly homeDirectory: string;
  readonly monitorFolder: string;
  readonly rootDirectory: string;
}

/** What every launch, gate and prepare step of the forge puts on its search path: read afresh, since the registry and the files change. */
function forgeLaunchToolsOf(pipeline: Readonly<ToolNamingSteps> | null, forge: ToolForge): LaunchTools {
  const forbiddenRoots = agentToolForbiddenRootsOf(forge.rootDirectory, forge.monitorFolder);
  return launchToolsOf(pipeline, toolPlacesOf(forge.platformPorts, forge.homeDirectory, forbiddenRoots));
}

/** The folders a search path starts with, in the tools' order. */
function toolFoldersOf(tools: readonly PipelineTool[]): string[] {
  return tools.map((tool) => dirname(tool.path));
}

export const AgentTools = Object.freeze({
  toolUsesOf, foundPathOf, toolFactsOf, launchToolsOf, forgeLaunchToolsOf, toolPlacesOf, toolFoldersOf
});
