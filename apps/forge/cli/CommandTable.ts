/**
 * The commands `agent-progress` accepts and the module each one lives in. The list is derived from the
 * dispatch itself, so `cli/HelpText.spec.ts` can hold the help against `COMMAND_NAMES`: adding a
 * command is one entry here and one block in `cli/HelpText.ts`.
 */
import type { CommandContext } from './CommandContext.ts';
import type { CommandLoader }  from './CommandHandler.ts';
import type { ArgumentParser } from './arguments/ArgumentParser.ts';

export const COMMAND_TABLE = {
  init:            async () => (await import('./adoption/init/InitCommand.ts')).initCommand,
  update:          async () => (await import('./adoption/update/UpdateCommand.ts')).updateCommand,
  status:          async () => (await import('./tracking/status/StatusCommand.ts')).statusCommand,
  task:            async () => (await import('./tracking/task/TaskCommand.ts')).taskCommand,
  log:             async () => (await import('./tracking/log/LogCommand.ts')).logCommand,
  hook:            async () => (await import('./hooks/HookCommand.ts')).hookCommand,
  usage:           async () => (await import('./measurement/usage/UsageCommand.ts')).usageCommand,
  'review-stats':  async () => (await import('./measurement/review-stats/ReviewStatsCommand.ts')).reviewStatsCommand,
  ticket:          async () => (await import('./tickets/TicketCommand.ts')).ticketCommand,
  epic:            async () => (await import('./epics/EpicCommand.ts')).epicCommand,
  draft:           async () => (await import('./drafts/DraftCommand.ts')).draftCommand,
  concurrency:     async () => (await import('./dispatch/concurrency/ConcurrencyCommand.ts')).concurrencyCommand,
  merges:          async () => (await import('./merges/MergesCommand.ts')).mergesCommand,
  merge:           async () => (await import('./merges/MergeCommand.ts')).mergeCommand,
  worktree:        async () => (await import('./worktrees/WorktreeCommand.ts')).worktreeCommand,
  gate:            async () => (await import('./gates/GateCommand.ts')).gateCommand,
  decisions:       async () => (await import('./decisions/DecisionsCommand.ts')).decisionsCommand,
  decide:          async () => (await import('./decisions/DecideCommand.ts')).decideCommand,
  question:        async () => (await import('./decisions/QuestionCommand.ts')).questionCommand,
  need:            async () => (await import('./needs/NeedCommand.ts')).needCommand,
  document:        async () => (await import('./documents/DocumentCommand.ts')).documentCommand,
  incidents:       async () => (await import('./incidents/IncidentsCommand.ts')).incidentsCommand,
  incident:        async () => (await import('./incidents/IncidentCommand.ts')).incidentCommand,
  jobs:            async () => (await import('./jobs/JobsCommand.ts')).jobsCommand,
  job:             async () => (await import('./jobs/JobCommand.ts')).jobCommand,
  resume:          async () => (await import('./resume/ResumeCommand.ts')).resumeCommand,
  'crash-log':     async () => (await import('./crash-log/CrashLogCommand.ts')).crashLogCommand,
  intake:          async () => (await import('./intake/IntakeCommand.ts')).intakeCommand,
  advise:          async () => (await import('./pipeline/AdviseCommand.ts')).adviseCommand,
  pipeline:        async () => (await import('./pipeline/PipelineCommand.ts')).pipelineCommand,
  await:           async () => (await import('./tracking/await/AwaitCommand.ts')).awaitCommand,
  range:           async () => (await import('./tracking/range/RangeCommand.ts')).rangeCommand,
  namespace:       async () => (await import('./tracking/namespace/NamespaceCommand.ts')).namespaceCommand,
  clear:           async () => (await import('./tracking/clear/ClearCommand.ts')).clearCommand,
  version:         async () => (await import('./hephaestus/VersionCommand.ts')).versionCommand,
  start:           async () => (await import('./hephaestus/StartCommand.ts')).startCommand,
  stop:            async () => (await import('./hephaestus/StopCommand.ts')).stopCommand,
  restart:         async () => (await import('./hephaestus/RestartCommand.ts')).restartCommand,
  pause:           async () => (await import('./hephaestus/PauseCommand.ts')).pauseCommand,
  unpause:         async () => (await import('./hephaestus/UnpauseCommand.ts')).unpauseCommand,
  'talos-restart': async () => (await import('./hephaestus/TalosRestartCommand.ts')).talosRestartCommand,
  machine:         async () => (await import('./dispatch/machine/MachineCommand.ts')).machineCommand,
  help:            async () => {
    const { helpText } = await import('./HelpText.ts');
    return (_commandArguments: ArgumentParser, context: CommandContext) => {
      context.standardOutput(helpText(context.platformPorts.shellLine.lineGrammar));
      return Promise.resolve();
    };
  },
} as const satisfies Record<string, CommandLoader>;

export const COMMAND_NAMES = Object.keys(COMMAND_TABLE) as readonly (keyof typeof COMMAND_TABLE)[];

/** `Object.hasOwn`, never a bare lookup: the literal inherits `Object.prototype`, so `agent-progress constructor` would otherwise run and exit 0. */
export function commandLoaderFor(command: string): CommandLoader | undefined {
  if (!Object.hasOwn(COMMAND_TABLE, command)) return undefined;
  return COMMAND_TABLE[command as keyof typeof COMMAND_TABLE];
}
