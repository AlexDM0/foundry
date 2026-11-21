/**
 * The line over a level's chat that counts the open questions of the other levels, with a link to each of those levels: a question stays
 * in the thread of the session that asked it, and only this line says it waits elsewhere.
 */
import { MonoId, StateDot, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import type { OtherLevelQuestionsView }           from '../agent-panel/PipelineAgentPanelModel.ts';
import { PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';

export interface OtherLevelQuestionsStripProps {
  readonly view:   OtherLevelQuestionsView;
  /** Where the same screen opens at another level. */
  readonly hrefOf: (level: PipelineLevel) => string;
}

export function OtherLevelQuestionsStrip({ view, hrefOf }: OtherLevelQuestionsStripProps) {
  return (
    <div className="board-other-level-questions" role="status">
      <StateDot tone="accent" small />
      <Text typeRole="small">{view.text}</Text>
      <span className="board-other-level-questions-links">
        {view.levels.map((level) => {
          const name = PipelineLevelModel.levelNameOf(level);
          return (
            <a key={PipelineLevelModel.itemAtLevel(level, null)} className="board-other-level-questions-link" href={hrefOf(level)}>
              {PipelineLevelModel.isForgeLevel(level) ? name : <MonoId text={name} tone="link" />}
            </a>
          );
        })}
      </span>
      <span className="board-other-level-questions-note"><Text typeRole="small" subtle>Each stays in its own thread</Text></span>
    </div>
  );
}
