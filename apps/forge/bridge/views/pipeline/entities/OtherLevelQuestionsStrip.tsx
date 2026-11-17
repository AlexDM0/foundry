/**
 * The line over a level's chat that counts the open questions of the other levels, with a link to each of those levels: a question stays
 * in the thread of the session that asked it, and only this line says it waits elsewhere.
 */
import { MonoId }   from 'design-system/MonoId';
import { StateDot } from 'design-system/StateDot';
import { Text }     from 'design-system/Text';

import type { OtherLevelQuestionsView }           from '../agent-panel/PipelineAgentPanelModel.ts';
import { PipelineLevelModel, type PipelineLevel } from './PipelineLevelModel.ts';

export interface OtherLevelQuestionsStripProps {
  readonly view:   OtherLevelQuestionsView;
  /** Where the same screen opens at another level. */
  readonly hrefOf: (level: PipelineLevel) => string;
}

export function OtherLevelQuestionsStrip({ view, hrefOf }: OtherLevelQuestionsStripProps) {
  return (
    <div className="bridge-other-level-questions" role="status">
      <StateDot tone="accent" small />
      <Text typeRole="small">{view.text}</Text>
      <span className="bridge-other-level-questions-links">
        {view.levels.map((level) => {
          const name = PipelineLevelModel.levelNameOf(level);
          return (
            <a key={PipelineLevelModel.itemAtLevel(level, null)} className="bridge-other-level-questions-link" href={hrefOf(level)}>
              {PipelineLevelModel.isForgeLevel(level) ? name : <MonoId text={name} tone="link" />}
            </a>
          );
        })}
      </span>
      <span className="bridge-other-level-questions-note"><Text typeRole="small" subtle>Each stays in its own thread</Text></span>
    </div>
  );
}
