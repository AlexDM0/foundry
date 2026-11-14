/**
 * The selected agent's panel when it is a forge's Flint brain (SCREENS A2): its time left, model and effort, what the forge reports of it,
 * that it is outside the machine's limit, the last moves it chose, and Stop beside the way to the brain in its forge. Once the forge drops
 * the brain, the panel says it is no longer running and keeps the way to its forge.
 */
import { Button }           from 'design-system/Button';
import { FactList }         from 'design-system/FactList';
import { MicroCapsLabel }   from 'design-system/MicroCapsLabel';
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';
import { Stamp }            from 'design-system/Stamp';
import { Text }             from 'design-system/Text';
import type { ReactNode }   from 'react';

import { BrainDiamond } from '../../design-system/BrainDiamond.tsx';
import {
  BRAIN_NAME,
  BrainStopButton,
  type BrainHandlers,
  RoleWord
} from './AgentsTable.tsx';
import type { BrainFact, SelectedBrainContent } from './BrainModel.ts';
import { BRAIN_EFFORT_LEVEL_COUNT }             from './utils/BrainTextUtil.ts';

type RunningBrain = Extract<SelectedBrainContent, { kind: 'brain-running' }>;

const OPEN_LABEL = 'Open in its forge';

function shownFactOf(fact: BrainFact) {
  return {
    label: fact.label,
    value: (
      <>
        <Text typeRole="small" mono>{fact.machineValue}</Text>
        {fact.words === null ? null : ` ${fact.words}`}
      </>
    ),
  };
}

function BrainPanelHead({ ended, children }: { readonly ended: boolean; readonly children?: ReactNode }) {
  return (
    <div className="gaia-agents-panel-head">
      <BrainDiamond ended={ended} />
      <span className="gaia-agents-panel-kind">{BRAIN_NAME}</span>
      {children}
    </div>
  );
}

function ModelLine({ content }: { readonly content: RunningBrain }) {
  const {
    model, effort, effortLevel, spanText
  } = content;
  if (model === null && spanText === null) return null;
  return (
    <div className="gaia-agents-panel-brain-model">
      {model !== null && effort !== null && effortLevel !== null
        ? (
          <ModelEffortMeter
            model={model}
            effort={effort}
            level={effortLevel}
            levelCount={BRAIN_EFFORT_LEVEL_COUNT}
            accessibleName={`Model ${model}, effort ${effort}`}
            size="hero"
          />
        )
        : <span className="gaia-agents-panel-brain-model-words">{[model, effort].filter((word) => word !== null).join(' · ')}</span>}
      {spanText === null ? null : (
        <span className="gaia-agents-panel-project">
          {'· '}
          <span className="gaia-agents-panel-running">{spanText}</span>
          {' at most'}
        </span>
      )}
    </div>
  );
}

function OutsideTheLimitLine({ machineLimitFigure }: { readonly machineLimitFigure: string | null }) {
  return (
    <div className="gaia-agents-panel-brain-outside">
      <BrainDiamond />
      {machineLimitFigure === null ? 'Not counted in any agent limit' : (
        <span>
          {'Not counted in the '}
          <span className="gaia-agents-panel-running">{machineLimitFigure}</span>
          {' machine limit'}
        </span>
      )}
    </div>
  );
}

function RunningBrainPanel({ content, handlers }: { readonly content: RunningBrain; readonly handlers: BrainHandlers }) {
  return (
    <>
      <div className="gaia-agents-panel-section" data-section="head">
        <BrainPanelHead ended={false}>
          <span className="gaia-agents-panel-state">
            Running
            {content.timeLeftText === null ? null : (
              <>
                {' · '}
                <span className="gaia-agents-panel-brain-time-left">{`${content.timeLeftText} left`}</span>
              </>
            )}
          </span>
        </BrainPanelHead>
        <div className="gaia-agents-panel-lines">
          <div className="gaia-agents-panel-subject">
            <RoleWord role="brain" />
            <span className="gaia-agents-panel-project">{content.project}</span>
          </div>
          <ModelLine content={content} />
        </div>
      </div>
      <div className="gaia-agents-panel-section" data-section="facts">
        <MicroCapsLabel text="What the forge reports" element="div" />
        <FactList facts={content.facts.map(shownFactOf)} layout="table" />
        <OutsideTheLimitLine machineLimitFigure={content.machineLimitFigure} />
      </div>
      <div className="gaia-agents-panel-section" data-section="moves">
        <MicroCapsLabel text="Last moves it chose" element="div" />
        {content.moves.length === 0
          ? <p className="gaia-agents-panel-sentence">The forge reports no move yet.</p>
          : (
            <ol className="gaia-agents-panel-moves" aria-label="Last moves of Flint's brain">
              {content.moves.map((move) => (
                <li key={move.key} className="gaia-agents-panel-move">
                  <span className="gaia-agents-panel-move-at"><Stamp shortText={move.atText} /></span>
                  <span className="gaia-agents-panel-move-text">{move.text}</span>
                </li>
              ))}
            </ol>
          )}
      </div>
      <div className="gaia-agents-panel-section" data-section="foot">
        <p className="gaia-agents-panel-note">
          {content.spanText === null ? 'The brain ends by itself. ' : (
            <>
              {'The brain ends by itself at '}
              <span className="gaia-agents-panel-running">{content.spanText}</span>
              {'. '}
            </>
          )}
          Stop asks the forge to end it now.
        </p>
        <span className="gaia-agents-panel-actions">
          {content.stop === null ? null : <BrainStopButton stop={content.stop} project={content.project} onBrainCommand={handlers.onBrainCommand} place="panel" />}
          <Button label={OPEN_LABEL} href={content.openHref} compact />
        </span>
      </div>
    </>
  );
}

export function BrainPanel({ content, handlers }: { readonly content: SelectedBrainContent; readonly handlers: BrainHandlers }) {
  if (content.kind === 'brain-running') return <RunningBrainPanel content={content} handlers={handlers} />;
  return (
    <>
      <div className="gaia-agents-panel-section" data-section="head">
        <BrainPanelHead ended />
        <div className="gaia-agents-panel-subject">
          <span className="gaia-agents-panel-project">{content.project}</span>
        </div>
      </div>
      <div className="gaia-agents-panel-section" data-section="sentence">
        <p className="gaia-agents-panel-sentence">{`${BRAIN_NAME} is no longer running.`}</p>
      </div>
      <div className="gaia-agents-panel-section" data-section="foot">
        <span className="gaia-agents-panel-actions">
          <Button label={OPEN_LABEL} href={content.openHref} compact />
        </span>
      </div>
    </>
  );
}
