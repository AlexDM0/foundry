/**
 * What the smallest pipeline is, as the About tab of the pipeline panel: the warning while no phase has a gate, and where an add card adds
 * a step. While it is edited, the panel shows About alone; on a live board, About is the first tab of the activity panel.
 */
import { Tabs }                             from 'design-system/Tabs';
import { Text }                             from 'design-system/Text';
import { View }                             from 'design-system/View';
import type { BoardPipelineFlowDocument }   from '../../../../@types/board/BoardPipelineDocuments.ts';
import { PipelinePanel, PipelinePanelBody } from '../PipelinePanel.tsx';
import { FlowGlyph }                        from '../flow/FlowGlyph.tsx';
import { MinimalPipelineNoteModel }         from './MinimalPipelineNoteModel.ts';

export const ABOUT_PANEL_TITLE = 'About this pipeline';

export interface MinimalPipelineNoteProps {
  readonly flow: Pick<BoardPipelineFlowDocument, 'insertSlots' | 'gateRows'>;
}

/** The About tab's content. */
export function MinimalPipelineAbout({ flow }: MinimalPipelineNoteProps) {
  const note = MinimalPipelineNoteModel.noteOf(flow);
  return (
    <>
      <View gap="four">
        <Text typeRole="page">The smallest pipeline</Text>
        <Text typeRole="lead" muted element="p">
          The Builder, then the merge train. No gates and no review is a valid pipeline: a ticket lands right after its build.
        </Text>
      </View>
      {note.warningIsShown
        ? (
          <div className="board-pipeline-minimal-note-warning" role="note">
            <span className="board-pipeline-minimal-note-warning-mark" aria-hidden="true">!</span>
            <View gap="two">
              <Text bold>Nothing checks a commit before main</Text>
              <Text muted>Conflicts still go to the builder.</Text>
            </View>
          </div>
        )
        : null}
      <section className="board-pipeline-minimal-note-steps" aria-label="Where steps go">
        <Text typeRole="small" subtle element="h4">Where steps go</Text>
        <ul className="board-pipeline-minimal-note-step-list">
          {note.stepLines.map((line) => (
            <li key={line.key} className="board-pipeline-minimal-note-step">
              <FlowGlyph glyph="plus" />
              <Text muted>{line.text}</Text>
            </li>
          ))}
        </ul>
        <Text typeRole="small" subtle element="p">An add card shows only where a step is missing. A removed step leaves its add card behind.</Text>
      </section>
    </>
  );
}

/** The panel beside the smallest pipeline while it is edited: About alone. */
export function MinimalPipelineNote({ flow }: MinimalPipelineNoteProps) {
  return (
    <PipelinePanel
      label={ABOUT_PANEL_TITLE}
      title={ABOUT_PANEL_TITLE}
      tabs={<Tabs label="About this pipeline" mode="switch" size="section" selectedKey="about" onSelect={() => undefined} items={[{ key: 'about', label: 'About' }]} />}
      tabPanelLabel="About"
    >
      <PipelinePanelBody>
        <MinimalPipelineAbout flow={flow} />
      </PipelinePanelBody>
    </PipelinePanel>
  );
}
