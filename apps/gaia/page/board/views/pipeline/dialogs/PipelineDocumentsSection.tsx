/**
 * The Pipeline documents section of the builder's and the reviewer's dialogs: under its title, with the orange New pill beside it, a ruled row per
 * document (the spec, then the plan) with Always, If you approved it and Never, and the line that says what If you approved it gives. A
 * document the forge fixes for the role (the reviewer's spec) stays at its rule, its other choices shown disabled. The rules are the
 * form's: nothing is sent until the dialog's Save.
 */
import { useId } from 'react';
import {
  Row,
  SegmentedControl,
  Tag,
  Text
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import {
  PipelineDocumentsSectionModel,
  type DocumentReadingDefaults,
  type DocumentReadingRole,
  type DocumentReadingRules
} from './PipelineDocumentsSectionModel.ts';

export interface PipelineDocumentsSectionProps {
  readonly role:     DocumentReadingRole;
  readonly rules:    DocumentReadingRules;
  /** The forge's defaults and fixed documents, as its board's limits serve them. */
  readonly defaults: DocumentReadingDefaults;
  readonly onChange: (rules: DocumentReadingRules) => void;
}

export function PipelineDocumentsSection({
  role, rules, defaults, onChange
}: PipelineDocumentsSectionProps) {
  const titleId = useId();
  const words = PipelineDocumentsSectionModel.WORDS;
  return (
    <section className="board-pipeline-dialog-instructions" aria-labelledby={titleId}>
      <Row gap="ten" centerY wrap>
        <Text typeRole="title" id={titleId}>{words.title}</Text>
        <Tag text={words.newPill} tone="warn" />
        <Text muted>{words.lead}</Text>
      </Row>
      <div className="board-pipeline-dialog-brief">
        {PipelineDocumentsSectionModel.rowsOf(role, rules, defaults).map((row) => (
          <div key={row.document} className="board-pipeline-dialog-brief-row" data-document="">
            <span className="board-pipeline-dialog-document-name">
              <Text bold>{row.title}</Text>
              {row.hint === null ? null : <Text typeRole="tab" muted>{row.hint}</Text>}
            </span>
            <SegmentedControl
              accessibleName={row.groupName}
              options={row.choices}
              selected={row.selected}
              size="compact"
              onSelect={(rule) => onChange(PipelineDocumentsSectionModel.withRule(rules, row.document, rule))}
            />
          </div>
        ))}
      </div>
      <Text typeRole="tab" muted>
        <Text typeRole="tab" bold>{words.explanationTerm}</Text>
        {` ${words.explanation}`}
      </Text>
    </section>
  );
}
