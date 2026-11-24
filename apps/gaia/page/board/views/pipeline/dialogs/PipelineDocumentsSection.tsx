/**
 * The Pipeline documents section of the builder's and the reviewer's dialogs: under its title, a ruled row per document (the spec, then
 * the plan) with Always, If you approved it and Never, and the line that says what If you approved it gives. The reviewer's spec stays at
 * Always, its other choices shown disabled. The rules are the form's: nothing is sent until the dialog's Save.
 */
import { useId }                                                                              from 'react';
import { Row, SegmentedControl, Text }                                                        from '../../../../lib/design-system/DesignSystemInterface.ts';
import { PipelineDocumentsSectionModel, type DocumentReadingRole, type DocumentReadingRules } from './PipelineDocumentsSectionModel.ts';

export interface PipelineDocumentsSectionProps {
  readonly role:     DocumentReadingRole;
  readonly rules:    DocumentReadingRules;
  readonly onChange: (rules: DocumentReadingRules) => void;
}

export function PipelineDocumentsSection({ role, rules, onChange }: PipelineDocumentsSectionProps) {
  const titleId = useId();
  const words = PipelineDocumentsSectionModel.WORDS;
  return (
    <section className="board-pipeline-dialog-instructions" aria-labelledby={titleId}>
      <Row gap="ten" centerY wrap>
        <Text typeRole="title" id={titleId}>{words.title}</Text>
        <Text muted>{words.lead}</Text>
      </Row>
      <div className="board-pipeline-dialog-brief">
        {PipelineDocumentsSectionModel.rowsOf(role, rules).map((row) => (
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
