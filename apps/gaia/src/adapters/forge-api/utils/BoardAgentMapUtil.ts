/**
 * Maps a forge's agent facts into Gaia's `BoardAgent`, and the agent and tools a pipeline or a setup record names; a tool named alone
 * reaches the forge without a path, so forge finds it.
 */
import type {
  AgentProgramCheckDocument,
  AgentToolDocument,
  AgentToolUseDocument,
  BoardAgentDocument,
  PipelineAgentDocument,
  PipelineToolRequestDocument,
} from 'forge-contracts/BoardAgentDocuments';
import type { BoardJobNotLaunchedDocument } from 'forge-contracts/BoardJobDocuments';

import type {
  BoardAgent,
  BoardAgentProgramCheck,
  BoardAgentTool,
  BoardAgentToolUse,
  BoardJobNotLaunched,
  BoardPipelineAgent,
  BoardToolRequest,
} from '../../../shared/@types/board/BoardAgent.ts';
import { VocabularyMapUtil } from './VocabularyMapUtil.ts';

const VOCABULARIES = VocabularyMapUtil.vocabularies;

function pipelineAgentOf(agent: PipelineAgentDocument): BoardPipelineAgent {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function pipelineAgentOut(agent: BoardPipelineAgent): PipelineAgentDocument {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function toolRequestOf(request: PipelineToolRequestDocument): BoardToolRequest {
  return { name: request.name, path: request.path ?? null };
}

function toolRequestOut(request: BoardToolRequest): PipelineToolRequestDocument {
  return request.path === null ? { name: request.name } : { name: request.name, path: request.path };
}

function checkOf(check: AgentProgramCheckDocument): BoardAgentProgramCheck {
  if (check.verdict === 'runs') return { verdict: 'runs', version: check.version };
  return { verdict: 'does-not-run', cause: VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentProgramRefusalCause, check.cause), sentence: check.sentence };
}

function toolUseOf(use: AgentToolUseDocument): BoardAgentToolUse {
  const kind = VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentToolUseKind, use.kind);
  return use.kind === 'every-job' ? { kind, name: null, entity: null } : { kind, name: use.name, entity: use.entity };
}

function toolOf(tool: AgentToolDocument): BoardAgentTool {
  return {
    name: tool.name, path: tool.path, approved: tool.approved, usedBy: tool.usedBy.map(toolUseOf)
  };
}

function agentOf(agent: BoardAgentDocument): BoardAgent {
  return {
    vendors:            agent.vendors.map((vendor) => ({ vendor: vendor.vendor, displayName: vendor.displayName, supported: vendor.supported })),
    choice:             agent.choice === null ? null : pipelineAgentOf(agent.choice),
    machineProgramPath: agent.machineProgramPath,
    programPath:        agent.programPath,
    check:              agent.check === null ? null : checkOf(agent.check),
    places:             agent.places.map((place) => ({ path: place.path, found: place.found })),
    toolsListed:        agent.toolsListed,
    tools:              agent.tools.map(toolOf),
  };
}

function notLaunchedOf(notLaunched: BoardJobNotLaunchedDocument | null): BoardJobNotLaunched | null {
  if (notLaunched === null) return null;
  return {
    cause:       VocabularyMapUtil.gaiaValueOf(VOCABULARIES.agentProgramRefusalCause, notLaunched.cause),
    programPath: notLaunched.programPath,
    sentence:    notLaunched.sentence,
  };
}

export const BoardAgentMapUtil = Object.freeze({
  agentOf,
  notLaunchedOf,
  pipelineAgentOf,
  pipelineAgentOut,
  toolOf,
  toolRequestOf,
  toolRequestOut,
});
