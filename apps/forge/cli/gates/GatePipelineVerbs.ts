/**
 * The `gate` verbs: the only writers and the reader of the board's `pipeline.json`, each write one control command in a hold, relayed under a job
 * except the agent and tools User alone sets. A command line goes after `--`, so its words are never read as options. On a pipeline with
 * entities the Board refuses each write of the forge's own steps, gates and reach, since every entity holds its own.
 */
import { PipelineFile }                from '../../src/adapters/pipeline/PipelineFile.ts';
import { GATE_PHASES, type GatePhase } from '../../src/domain/tracker-model/@types/GatePhase.ts';
import type {
  Pipeline,
  PipelineGate,
  PipelinePhaseOrders,
  PipelineStep
} from '../../src/domain/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                                   from '../../src/domain/tracker-model/utils/PipelineUtil.ts';
import { type CacheFolderRefusal, GateCachePaths }        from '../../src/services/hephaestus/GateCachePaths.ts';
import type { ControlCommand, ControlCommandOf }          from '../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                               from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import { PathNestingUtil }                                from '../../src/shared/utils/PathNestingUtil.ts';
import { agentFrom, toolFrom }                            from '../AgentProgramWords.ts';
import { applyCommandOfVerb }                             from '../ApplyCommandOfVerb.ts';
import { billingFrom }                                    from '../BillingWords.ts';
import { boardReadsOf }                                   from '../BoardStoreOf.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import { hatchWhenUnderJob }                              from '../HatchUnderJob.ts';
import { refuseUsage }                                    from '../RecordedIncidentMove.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { OutputUtil }                                     from '../utils/OutputUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;

export const GATE_PIPELINE_USAGE = {
  prepare: `${PROGRAM} gate prepare <name> [--in <folder>] [--json] -- <command>`,
  add:     `${PROGRAM} gate add <name> [--fix "<command>"] [--in <folder>] [--defined-by <pattern>]… [--network <domain>]… [--writes <path>]… `
    + '[--forge-only] [--phases <phase>,…] [--json] -- <command>',
  order:        `${PROGRAM} gate order build|review|merge <name>… [--json]`,
  none:         `${PROGRAM} gate none [--json]`,
  remove:       `${PROGRAM} gate remove <name> [--json]`,
  list:         `${PROGRAM} gate list [--json]`,
  approval:     `${PROGRAM} gate approval tickets|merge|spec|plan on|off [--json]`,
  assistant:    `${PROGRAM} gate assistant on|off [--json]`,
  reach:        `${PROGRAM} gate reach <path>…|none [--json]`,
  agent:        `${PROGRAM} gate agent machine|<path> [--billing subscription|api] [--max-budget-usd <n>] [--json]`,
  tools:        `${PROGRAM} gate tools <name>[=<path>]…|pipeline [--json]`,
  'look-again': `${PROGRAM} gate look-again [--json]`,
} as const;

const GATE_ADD_OPTION_NAMES = ['fix', 'in', 'defined-by', 'network', 'writes', 'forge-only', 'phases', 'json'];

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const REACH_NONE_WORD = 'none';

const FOLLOW_PIPELINE_WORD = 'pipeline';

const UNWRITABLE_FOLDER_WORDING: Readonly<Record<CacheFolderRefusal, string>> = {
  'executables-folder': 'is, sits in or holds a bin folder or executables',
  'search-path-folder': 'is, sits in or holds a folder on PATH',
};

function nameFrom(commandArguments: ArgumentParser, usage: string): string {
  const name = commandArguments.positionalsBeforeSeparator()[1];
  if (name === undefined) refuseUsage('Name the step.', usage);
  if (!NAME_PATTERN.test(name)) refuseUsage(`"${name}" is not a step name: letters, digits, dots, dashes and underscores, starting with a letter or digit.`, usage);
  return name;
}

/** Everything after `--`, joined: one quoted argument or the command's words as typed. A line longer than this machine's shell takes is refused. */
function commandLineFrom(commandArguments: ArgumentParser, context: CommandContext, usage: string): string {
  if (commandArguments.positionalsBeforeSeparator().length > 2) refuseUsage('Put the command after --.', usage);
  const commandLine = commandArguments.positionals().slice(2).join(' ').trim();
  if (commandLine === '') refuseUsage('Give the command after --.', usage);
  const { lineLimitCharacters } = context.platformPorts.shellLine;
  if (lineLimitCharacters !== null && commandLine.length > lineLimitCharacters) {
    refuseUsage(`The command is ${commandLine.length} characters, and this machine's shell runs at most ${lineLimitCharacters}; nothing was stored.`, usage);
  }
  return commandLine;
}

/** A folder a gate could never write is refused when stored, so Hephaestus's later dropping of it never comes as a surprise. */
function refuseUnwritableFolder(path: string, context: CommandContext, usage: string): void {
  if (!PathNestingUtil.wirePathIsWellFormed(path)) refuseUsage(`--writes takes an absolute or ~/ folder, and ${path} is neither.`, usage);
  const refusal = GateCachePaths.refusalOf(path, context.homeDirectory, context.executableSearchPath, context.platformPorts.dataFolders);
  if (refusal !== null) refuseUsage(`The folder ${path} ${UNWRITABLE_FOLDER_WORDING[refusal]}, so a gate may never write it; nothing was stored.`, usage);
}

/** `--in`: a folder of the project in the worktree, or of the repository when it leads with `/`; one outside both is refused when stored. */
function folderFrom(commandArguments: ArgumentParser, usage: string): string | undefined {
  const folder = commandArguments.option('in');
  if (folder === undefined || PathNestingUtil.projectWirePathStaysInside(folder)) return folder;
  return refuseUsage(`--in takes a folder of the project, or of the repository when it starts with /, and ${folder} leaves both.`, usage);
}

function phaseOf(word: string | undefined, usage: string): GatePhase {
  const phase = GATE_PHASES.find((candidate) => candidate === word);
  if (phase === undefined) refuseUsage(`Name a phase: ${GATE_PHASES.join(', ')}.`, usage);
  return phase;
}

/** `--phases build,merge`: each phase once; absent, the Board keeps a replaced gate's phases and runs a new one in every phase. */
function phasesFrom(commandArguments: ArgumentParser, usage: string): GatePhase[] | null {
  const phasesText = commandArguments.option('phases');
  if (phasesText === undefined) return null;
  const phases = phasesText.split(',').map((word) => phaseOf(word.trim(), usage));
  if (new Set(phases).size !== phases.length) refuseUsage('Name each phase once in --phases.', usage);
  return phases;
}

/** The content hash guards a whole-pipeline edit; a phase hash is what a green gate run in that phase is judged by. */
function hashesOf(pipeline: Readonly<Pipeline>): { contentHash: string; phaseHashes: Record<GatePhase, string> } {
  return {
    contentHash: PipelineUtil.contentHashOf(pipeline),
    phaseHashes: {
      build:  PipelineUtil.phaseHashOf(pipeline, 'build'),
      review: PipelineUtil.phaseHashOf(pipeline, 'review'),
      merge:  PipelineUtil.phaseHashOf(pipeline, 'merge'),
    },
  };
}

async function applyPipelineChange(commandArguments: ArgumentParser, context: CommandContext, command: ControlCommand): Promise<void> {
  await hatchWhenUnderJob(context, command);
  const changed = (await applyCommandOfVerb(commandArguments, context, command)).result;
  if (!('pipeline' in changed)) return;
  const { logged, pipeline } = changed;
  OutputUtil.printEntity(commandArguments, context, { pipeline: PipelineFile.storedDocumentOf(pipeline), ...hashesOf(pipeline) }, OutputUtil.loggedSentencesOf(logged));
}

/** The agent's program and the tools are User's choice of what runs on the machine, so a session never relays them. */
async function applyUnrelayedChange(
  commandArguments: ArgumentParser,
  context: CommandContext,
  command: ControlCommandOf<'pipeline-agent-set' | 'pipeline-tools-set' | 'agent-look-again'>,
): Promise<void> {
  if (context.job !== undefined) throw new OperationRefusal('refused', { kind: 'verb-not-relayable', verb: context.commandVerb, jobId: context.job.jobId });
  const { logged } = (await applyCommandOfVerb(commandArguments, context, command)).result;
  const pipeline = boardReadsOf(context).requireBoard().pipelineReading;
  const stored = pipeline.verdict === 'readable' ? { pipeline: PipelineFile.storedDocumentOf(pipeline.pipeline), ...hashesOf(pipeline.pipeline) } : {};
  OutputUtil.printEntity(commandArguments, context, { ...stored, logged }, OutputUtil.loggedSentencesOf(logged));
}

/** The forge's agent, run once before it is kept, with the billing it is stored with, if one is named; an open setup record follows it. */
export async function setAgent(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.agent;
  commandArguments.rejectUnknownOptions(['billing', 'max-budget-usd', 'json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const billingWord = commandArguments.option('billing');
  if (billingWord === undefined && commandArguments.option('max-budget-usd') !== undefined) refuseUsage('--max-budget-usd goes only with api billing.', usage);
  await applyUnrelayedChange(commandArguments, context, {
    kind:  'pipeline-agent-set',
    agent: agentFrom(commandArguments.positionals()[1], context, usage),
    ...(billingWord === undefined ? {} : { billing: billingFrom(commandArguments, billingWord, usage) }),
  });
}

/** The whole list at once, git always among them; `pipeline` removes the list, so the tools follow the pipeline's programs again. */
export async function setTools(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.tools;
  commandArguments.rejectUnknownOptions(['json'], usage);
  const words = commandArguments.positionals().slice(1);
  if (words.length === 0) refuseUsage('Name each tool, or pipeline.', usage);
  const tools = words.length === 1 && words[0] === FOLLOW_PIPELINE_WORD ? null : words.map((word) => toolFrom(word, context, usage));
  await applyUnrelayedChange(commandArguments, context, { kind: 'pipeline-tools-set', tools });
}

/** Every job that stood not launched for its agent's program is launched again by the next pass. */
export async function lookAgain(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE['look-again'];
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(1, usage);
  await applyUnrelayedChange(commandArguments, context, { kind: 'agent-look-again' });
}

export async function prepareStep(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.prepare;
  commandArguments.rejectUnknownOptions(['in', 'json'], usage);
  const step: PipelineStep = { name: nameFrom(commandArguments, usage), run: commandLineFrom(commandArguments, context, usage) };
  const folder = folderFrom(commandArguments, usage);
  if (folder !== undefined) step.in = folder;
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-prepare-step-set', step });
}

export async function addGate(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.add;
  commandArguments.rejectUnknownOptions(GATE_ADD_OPTION_NAMES, usage);
  const gate: PipelineGate = { name: nameFrom(commandArguments, usage), run: commandLineFrom(commandArguments, context, usage) };
  const fix    = commandArguments.option('fix');
  const folder = folderFrom(commandArguments, usage);
  if (fix !== undefined) gate.fix = fix;
  if (folder !== undefined) gate.in = folder;
  const definedBy = commandArguments.optionValues('defined-by');
  const network   = commandArguments.optionValues('network');
  const writes    = commandArguments.optionValues('writes');
  if (definedBy.length > 0) gate.definedBy = definedBy;
  if (network.length > 0) gate.network = network;
  for (const path of writes) refuseUnwritableFolder(path, context, usage);
  if (writes.length > 0) gate.writes = writes;
  if (commandArguments.flag('forge-only')) gate.forgeOnly = true;
  const phases = phasesFrom(commandArguments, usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-gate-add', gate, ...(phases === null ? {} : { phases }) });
}

export async function orderPhaseGates(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.order;
  commandArguments.rejectUnknownOptions(['json'], usage);
  const [, phaseWord, ...names] = commandArguments.positionals();
  const phase = phaseOf(phaseWord, usage);
  if (names.length === 0) refuseUsage(`Name every gate the ${phase} phase runs, in the new order.`, usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-gate-order', phase, names });
}

export async function setNoGates(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['json'], GATE_PIPELINE_USAGE.none);
  commandArguments.rejectExtraPositionals(1, GATE_PIPELINE_USAGE.none);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-gates-none' });
}

export async function removeGate(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.remove;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-gate-remove', name: nameFrom(commandArguments, usage) });
}

export async function setApproval(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.approval;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, usage);
  const [, approval, switchState] = commandArguments.positionals();
  if (approval !== 'tickets' && approval !== 'merge' && approval !== 'spec' && approval !== 'plan') refuseUsage('Name the approval: tickets, merge, spec or plan.', usage);
  if (switchState !== 'on' && switchState !== 'off') refuseUsage('Write on or off.', usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-approval-set', approval, on: switchState === 'on' });
}

export async function setAssistant(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.assistant;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  const [, switchState] = commandArguments.positionals();
  if (switchState !== 'on' && switchState !== 'off') refuseUsage('Write on or off.', usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-assistant-set', on: switchState === 'on' });
}

/** The whole reach at once, each path once: `none` clears it. A path that is not the repository's, leading with `/`, is refused. */
export async function setReach(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = GATE_PIPELINE_USAGE.reach;
  commandArguments.rejectUnknownOptions(['json'], usage);
  const words = commandArguments.positionals().slice(1);
  if (words.length === 0) refuseUsage('Name each repository path the board may change besides its project, or none.', usage);
  const paths = words.length === 1 && words[0] === REACH_NONE_WORD ? [] : words;
  const outsideRepository = paths.find((path) => !PathNestingUtil.repositoryWirePathStaysInside(path));
  if (outsideRepository !== undefined) refuseUsage(`${outsideRepository} is not a path of the repository: start it with /, and leave out .. and \\.`, usage);
  if (new Set(paths).size !== paths.length) refuseUsage('Name each path once.', usage);
  await applyPipelineChange(commandArguments, context, { kind: 'pipeline-reach-set', paths });
}

/** A gate in every phase, as a plain `gate add` stores it, is marked with no phase; any other names the phases it runs in. */
function gateLineOf(gate: Readonly<PipelineGate>, phases: Readonly<PipelinePhaseOrders>): string {
  const phasesOfGate = GATE_PHASES.filter((phase) => phases[phase].includes(gate.name));
  const marks = [
    ...(gate.in === undefined ? [] : [`in ${gate.in}`]),
    ...(phasesOfGate.length === GATE_PHASES.length ? [] : [`runs in ${phasesOfGate.length === 0 ? 'no phase' : phasesOfGate.join(', ')}`]),
  ];
  return `  ${gate.name}${marks.length === 0 ? '' : ` (${marks.join('; ')})`}: ${gate.run}`;
}

function pipelineTextOf(pipeline: Readonly<Pipeline> | null): string {
  if (pipeline === null) return `No pipeline is set, so no gate runs and the board holds new work (checks-not-set). Add a gate with \`${GATE_PIPELINE_USAGE.add}\`, or `
    + `\`${PROGRAM} gate none\` for none on purpose.`;
  const prepare = pipeline.prepare.map((step) => `  ${step.name}${step.in === undefined ? '' : ` (in ${step.in})`}: ${step.run}`);
  const gates   = pipeline.gates.length === 0 ? ['  none, on purpose'] : pipeline.gates.map((gate) => gateLineOf(gate, pipeline.phases));
  const ticketReview  = `Ticket review: ${pipeline.approvals?.tickets === false ? 'off' : 'on'}`;
  const mergeApproval = `Merge approval: ${pipeline.approvals?.merge === true ? 'on' : 'off'}`;
  const documentReviews = pipeline.ticketWriting === 'spec-then-plan'
    ? [`Spec review: ${pipeline.approvals?.spec === false ? 'off' : 'on'}`, `Plan review: ${pipeline.approvals?.plan === false ? 'off' : 'on'}`]
    : [];
  const assistant     = `Assistant: ${pipeline.assistant === true ? 'on' : 'off'}`;
  const reach = pipeline.reach === undefined ? [] : [`Reach: ${pipeline.reach.join(' ')}`];
  return [...(prepare.length === 0 ? [] : ['Prepare:', ...prepare]), 'Gates:', ...gates, ticketReview, mergeApproval, ...documentReviews, assistant, ...reach].join('\n');
}

/** Takes no lock and writes nothing; a pipeline the store judges malformed, older or out of place is refused, since nothing could be listed from it. */
export function listPipeline(commandArguments: ArgumentParser, context: CommandContext): void {
  commandArguments.rejectUnknownOptions(['json'], GATE_PIPELINE_USAGE.list);
  commandArguments.rejectExtraPositionals(1, GATE_PIPELINE_USAGE.list);
  const reads            = boardReadsOf(context);
  const reading          = reads.readPipeline();
  const pipelineLocation = reads.locationOf({ record: 'pipeline' });
  if (reading.verdict === 'malformed' && reading.unsupportedEntities !== undefined) {
    throw new OperationRefusal('refused', { ...reading.unsupportedEntities, filePath: pipelineLocation });
  }
  if (reading.verdict === 'malformed') throw new OperationRefusal('refused', { kind: 'malformed-pipeline', filePath: pipelineLocation, problem: reading.problem });
  if (reading.verdict === 'older') throw new OperationRefusal('refused', { kind: 'older-pipeline', filePath: pipelineLocation });
  const pipeline = reading.verdict === 'readable' ? reading.pipeline : null;
  const entity = {
    pipelineIsSet: pipeline !== null,
    ...(pipeline === null ? { contentHash: null, phaseHashes: null } : hashesOf(pipeline)),
    ...(pipeline === null ? {} : { version: pipeline.version }),
    prepare:       pipeline?.prepare ?? [],
    gates:         pipeline?.gates ?? [],
    ...(pipeline === null ? {} : { phases: pipeline.phases }),
    ...(pipeline?.review === undefined ? {} : { review: pipeline.review }),
    ...(pipeline?.airlock === undefined ? {} : { airlock: pipeline.airlock }),
    ...(pipeline?.constitution === undefined ? {} : { constitution: pipeline.constitution }),
    ...(pipeline?.agents === undefined ? {} : { agents: pipeline.agents }),
    ...(pipeline?.approvals === undefined ? {} : { approvals: pipeline.approvals }),
    ...(pipeline === null ? {} : { assistant: pipeline.assistant === true }),
    ...(pipeline?.reach === undefined ? {} : { reach: pipeline.reach }),
  };
  OutputUtil.printEntity(commandArguments, context, entity, pipelineTextOf(pipeline));
}
