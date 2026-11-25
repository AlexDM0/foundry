/**
 * The forge's agent kinds: its agent and the tools its agents may run, which `pipeline.json` stores, and User's look again, which launches
 * every job that stood not launched. Whether a program runs and where a tool is were settled before the hold; the Board records only.
 */
import { posix, win32 } from 'node:path';

import type { Logged }                        from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { PipelineTool }                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';
import { agentFieldOf }                       from './PipelineSetupControls.ts';
import { requireReadablePipeline }            from './SettingControls.ts';

/** A stored pipeline that cannot be read is never written over; an open setup record takes the agent with no pipeline stored. */
function setAgent(command: CommandOf<'pipeline-agent-set'>, change: BoardTransaction): Logged {
  if (change.board.pipelineSetup() === null) requireReadablePipeline(change);
  return change.board.setAgent(agentFieldOf(command), change.at);
}

/** A tool reaches the hold with the absolute path it was found at; one with none was not found. */
function toolsOf(tools: readonly PipelineTool[] | null): PipelineTool[] | null {
  if (tools === null) return null;
  return tools.map((tool) => {
    if (!posix.isAbsolute(tool.path) && !win32.isAbsolute(tool.path)) throw new OperationRefusal('refused', { kind: 'tool-not-found', name: tool.name, searchedFolders: [] });
    return { name: tool.name, path: tool.path };
  });
}

function setTools(command: CommandOf<'pipeline-tools-set'>, change: BoardTransaction): Logged {
  requireReadablePipeline(change);
  return change.board.setTools(toolsOf(command.tools), change.at);
}

export const AGENT_CONTROLS = {
  'pipeline-agent-set': setAgent,
  'pipeline-tools-set': setTools,
  'agent-look-again':   (_command: CommandOf<'agent-look-again'>, change: BoardTransaction): Logged => change.board.retryNotLaunched(change.at),
} as const;
