/**
 * Makes the Agents view the agent panel habitat of Flint: it registers the view's element, cues an agent that appears, a change between
 * some agent working and all idle, the one action of the job Flint copies, and the changes of a job and of the launch slots; and it gives
 * Flint the job cell of the row it copies, found by the row's `data-job-id`. The rows differ only in height and Flint walks the bottom
 * edge, so it stands below the job column for every job. What the view mounts with is no change: the one actions jobs show then are taken
 * as shown, so a return to the view cues none again.
 */

import type { SpriteCopyTarget } from 'flint/SpriteHabitat';
import { useFlintHabitat }       from 'flint/react/UseFlintHabitat';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react';

import type { BoardOverseerDocument }                  from '../../../@types/board/BoardDocument.ts';
import { useCueOnChange }                              from '../../flint/UseCueOnChange.ts';
import type { EndedAgentJobDocument }                  from './AgentJobDocument.ts';
import { AGENT_PANEL_CUES, agentPanelSpriteHabitatOf } from './AgentPanelSpriteHabitat.ts';
import {
  AgentPanelSpriteModel,
  type AgentPanelFacts,
  type CopiedJob,
  type PanelConcurrency,
  type PanelJob,
  type ShownOneActions
} from './AgentPanelSpriteModel.ts';

/** The attribute `JobRow` puts on a job's row. */
const JOB_ROW_ID_ATTRIBUTE = 'data-job-id';
/** The cell of a job's row that `JobRow` gives the job's id and role. */
const JOB_CELL_SELECTOR = 'td[data-column="job"]';

/** What the agent panel reads of the board. */
export interface AgentPanelBoardFacts {
  readonly jobs:        readonly PanelJob[];
  readonly endedJobs:   readonly Pick<EndedAgentJobDocument, 'id' | 'outcome'>[];
  readonly concurrency: PanelConcurrency;
  readonly overseer:    Pick<BoardOverseerDocument, 'state' | 'paused'>;
}

interface CopyTargetSource {
  /** Called in an effect after each render, with what Flint should copy now. */
  readonly follow:        (viewElement: HTMLElement | null, copiedJob: CopiedJob | null) => void;
  readonly copyTargetFor: () => SpriteCopyTarget | null;
}

function createCopyTargetSource(): CopyTargetSource {
  let followedView: HTMLElement | null = null;
  let followedJob: CopiedJob | null = null;
  return {
    follow: (viewElement, copiedJob) => {
      followedView = viewElement;
      followedJob = copiedJob;
    },
    copyTargetFor: () => {
      if (followedView === null || followedJob === null) return null;
      const { jobId, intent } = followedJob;
      const row = [...followedView.querySelectorAll(`[${JOB_ROW_ID_ATTRIBUTE}]`)].find((element) => element.getAttribute(JOB_ROW_ID_ATTRIBUTE) === jobId);
      return row === undefined ? null : { element: row.querySelector(JOB_CELL_SELECTOR) ?? row, intent };
    },
  };
}

export function useAgentPanelHabitat(viewElement: RefObject<HTMLElement | null>, board: AgentPanelBoardFacts, selectedJobId: string | null): void {
  const {
    jobs, endedJobs, concurrency, overseer
  } = board;
  const [copyTargetSource] = useState(createCopyTargetSource);
  const habitat = useMemo(() => agentPanelSpriteHabitatOf(copyTargetSource.copyTargetFor), [copyTargetSource]);
  const sendCue = useFlintHabitat(viewElement, habitat);

  const previousJobIds = useRef(jobs.map((job) => job.id));
  useEffect(() => {
    const jobIds = jobs.map((job) => job.id);
    const greetedJobIds = AgentPanelSpriteModel.greetedJobIdsOf(previousJobIds.current, jobs);
    previousJobIds.current = jobIds;
    if (greetedJobIds.length > 0) sendCue(AGENT_PANEL_CUES.AGENT_APPEARS);
  }, [jobs, sendCue]);
  // After the appearance, so the newest cue, which the director answers, is that the agent works.
  useCueOnChange(sendCue, AgentPanelSpriteModel.activityOccasionOf(jobs, overseer));

  const shownOneActions = useRef<ShownOneActions>(AgentPanelSpriteModel.oneActionsOf(jobs));
  useEffect(() => {
    const copyStep = AgentPanelSpriteModel.copyStepOf(jobs, selectedJobId, shownOneActions.current);
    shownOneActions.current = copyStep.shownOneActions;
    copyTargetSource.follow(viewElement.current, copyStep.copiedJob);
    if (copyStep.oneActionCue !== null) sendCue(copyStep.oneActionCue);
  }, [jobs, selectedJobId, copyTargetSource, viewElement, sendCue]);

  const panelFacts = useMemo<AgentPanelFacts>(() => ({ jobs, endedJobs, concurrency }), [jobs, endedJobs, concurrency]);
  const previousPanelFacts = useRef(panelFacts);
  useEffect(() => {
    const cueNames = AgentPanelSpriteModel.changeCuesOf(previousPanelFacts.current, panelFacts);
    previousPanelFacts.current = panelFacts;
    // Last first, so the first row of the table that changed is the newest cue, which the director answers.
    for (const cueName of [...cueNames].reverse()) sendCue(cueName);
  }, [panelFacts, sendCue]);
}
