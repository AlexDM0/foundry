/** The board document's agent, its program's run and a tool's row, each mapped field by field from the facts Hephaestus read. */
import type {
  AgentBillingOptionDocument,
  AgentProgramCheckDocument,
  AgentToolDocument,
  AgentToolUseDocument,
  AgentVendorDocument,
  BoardAgentDocument,
  PipelineAgentDocument,
  PipelineToolDocument
} from 'forge-contracts/BoardAgentDocuments';

import type { PipelineAgent, PipelineTool } from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { AgentBillingOption }          from '../../../lib/agent-launch/AgentAdapter.ts';
import type {
  AgentFacts,
  AgentVendor,
  ToolFacts,
  ToolUse
} from '../../../shared/@types/AgentFacts.ts';
import type { AgentProgramCheck }  from '../../../shared/@types/AgentProgramCheck.ts';
import { AgentProgramWordingUtil } from '../../../shared/utils/AgentProgramWordingUtil.ts';

function pipelineAgentOf(agent: PipelineAgent): PipelineAgentDocument {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function pipelineToolOf(tool: PipelineTool): PipelineToolDocument {
  return { name: tool.name, path: tool.path };
}

function checkOf(check: AgentProgramCheck | null, agentName: string): AgentProgramCheckDocument | null {
  if (check === null) return null;
  if (check.verdict === 'runs') return { verdict: 'runs', version: check.version };
  return { verdict: 'does-not-run', cause: check.cause, sentence: AgentProgramWordingUtil.programClauseOf(check.cause, agentName, check.programPath, check.outputLine) };
}

function toolUseOf(use: ToolUse): AgentToolUseDocument {
  return use.kind === 'every-job' ? { kind: 'every-job' } : { kind: use.kind, name: use.name, entity: use.entity };
}

function toolOf(tool: ToolFacts): AgentToolDocument {
  return {
    name: tool.name, path: tool.path, approved: tool.approved, usedBy: tool.usedBy.map(toolUseOf)
  };
}

function billingOptionOf(option: AgentBillingOption): AgentBillingOptionDocument {
  return { mode: option.mode, keyVariableName: option.keyVariableName, capsEachLaunch: option.capsEachLaunch };
}

function vendorOf(vendor: AgentVendor): AgentVendorDocument {
  return {
    vendor: vendor.vendor, displayName: vendor.displayName, supported: vendor.supported, billingOptions: vendor.billingOptions.map(billingOptionOf)
  };
}

function agentOf(facts: AgentFacts): BoardAgentDocument {
  return {
    vendors:            facts.vendors.map(vendorOf),
    choice:             facts.choice === null ? null : pipelineAgentOf(facts.choice),
    machineProgramPath: facts.machineProgramPath,
    programPath:        facts.programPath,
    check:              checkOf(facts.check, facts.agentName),
    places:             facts.places.map((place) => ({ path: place.path, found: place.found })),
    toolsListed:        facts.toolsListed,
    tools:              facts.tools.map(toolOf),
  };
}

export const BoardAgentMappingUtil = Object.freeze({
  agentOf, pipelineAgentOf, pipelineToolOf, toolOf
});
