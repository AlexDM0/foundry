/** Maps Gaia's model of a forge's agent out to the page's board contract, with the count of other forges that follow this machine's program. */
import type {
  BoardAgentDocument,
  BoardAgentProgramCheckDocument,
  BoardAgentToolDocument,
  BoardJobNotLaunchedDocument,
  BoardPipelineAgentDocument,
  BoardToolRequestDocument,
} from '../../../page/@types/board/BoardAgentDocuments.ts';
import type {
  BoardAgent,
  BoardAgentProgramCheck,
  BoardAgentTool,
  BoardJobNotLaunched,
  BoardPipelineAgent,
  BoardToolRequest,
} from '../../shared/@types/board/BoardAgent.ts';

function pipelineAgentOut(agent: BoardPipelineAgent): BoardPipelineAgentDocument {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function checkOut(check: BoardAgentProgramCheck): BoardAgentProgramCheckDocument {
  if (check.verdict === 'runs') return { verdict: 'runs', version: check.version };
  return { verdict: 'does-not-run', cause: check.cause, text: check.sentence };
}

function toolOut(tool: BoardAgentTool): BoardAgentToolDocument {
  return {
    name:     tool.name,
    path:     tool.path,
    approved: tool.approved,
    usedBy:   tool.usedBy.map((use) => ({ kind: use.kind, name: use.name, entity: use.entity })),
  };
}

function toolRequestOut(request: BoardToolRequest): BoardToolRequestDocument {
  return { name: request.name, path: request.path };
}

function agentOut(agent: BoardAgent, otherForgesFollowingMachine: number | null): BoardAgentDocument {
  return {
    vendors:            agent.vendors.map((vendor) => ({ vendor: vendor.vendor, displayName: vendor.displayName, supported: vendor.supported })),
    choice:             agent.choice === null ? null : pipelineAgentOut(agent.choice),
    machineProgramPath: agent.machineProgramPath,
    programPath:        agent.programPath,
    check:              agent.check === null ? null : checkOut(agent.check),
    places:             agent.places.map((place) => ({ path: place.path, found: place.found })),
    toolsListed:        agent.toolsListed,
    tools:              agent.tools.map(toolOut),
    otherForgesFollowingMachine,
  };
}

function notLaunchedOut(notLaunched: BoardJobNotLaunched | null): BoardJobNotLaunchedDocument | null {
  return notLaunched === null ? null : { cause: notLaunched.cause, programPath: notLaunched.programPath, text: notLaunched.sentence };
}

export const BoardAgentDocumentMapUtil = Object.freeze({
  agentOut,
  notLaunchedOut,
  pipelineAgentOut,
  toolOut,
  toolRequestOut,
});
