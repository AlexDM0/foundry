/**
 * Sends a step dialog's question to the pipeline agent as a `job-message`. With no agent session on the board (a live board), it first
 * sends `pipeline-agent-advise`, which opens an advise session, and holds the question until the facts name that session's job; a refused
 * advise sends nothing more. Both commands go through `useControlCommand`, so either refusal is kept verbatim.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import { useControlCommand }         from '../../../shared/commands/ControlCommandSender.ts';

import type { PipelineAgentAsker } from './AgentStepDialog.tsx';

const ADVISE_COMMAND: BoardCommandDocument = Object.freeze({ boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-agent-advise', entity: null });

interface HeldQuestion {
  readonly questionNumber: number;
  readonly text:           string;
  readonly awaitsAdvise:   boolean;
}

/** `agentJobId` is the pipeline agent's job the facts name; null while none runs. */
export function usePipelineAgentQuestionSender(agentJobId: string | null, onAsked: () => void): PipelineAgentAsker {
  const [heldQuestion, setHeldQuestion] = useState<HeldQuestion | null>(null);
  const sentQuestionNumber = useRef(0);
  const messageCommand = useMemo(
    (): BoardCommandDocument | null => (heldQuestion === null || agentJobId === null ? null : {
      boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId: agentJobId, text: heldQuestion.text, pictures: [], incidentId: null
    }),
    [heldQuestion, agentJobId],
  );
  const messageSender = useControlCommand(messageCommand, { onApplied: onAsked });
  const adviseSender = useControlCommand(ADVISE_COMMAND);
  const adviseWasRefused = adviseSender.refusal !== null && heldQuestion?.awaitsAdvise === true;

  useEffect(() => {
    if (heldQuestion === null || messageCommand === null || adviseWasRefused || heldQuestion.questionNumber === sentQuestionNumber.current) return;
    if (!messageSender.enabled) return;
    sentQuestionNumber.current = heldQuestion.questionNumber;
    void messageSender.send();
  }, [heldQuestion, messageCommand, messageSender, adviseWasRefused]);

  const ask = (text: string): void => {
    if (!adviseSender.enabled) return;
    setHeldQuestion({ questionNumber: (heldQuestion?.questionNumber ?? sentQuestionNumber.current) + 1, text, awaitsAdvise: agentJobId === null });
    if (agentJobId === null) void adviseSender.send();
  };

  return { enabled: adviseSender.enabled, refusal: messageSender.refusal ?? adviseSender.refusal, ask };
}
