/**
 * "View pipeline.json": the stored file's text, read-only, in the mono face, byte for byte as the facts carry it.
 */
import { Dialog } from 'design-system/Dialog';

export interface PipelineFileDialogProps {
  readonly fileText: string;
  readonly onClose:  () => void;
}

export function PipelineFileDialog({ fileText, onClose }: PipelineFileDialogProps) {
  return (
    <Dialog
      title="pipeline.json"
      kicker="The applied pipeline"
      description="Read-only. Update pipeline edits it."
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="wide"
    >
      <pre className="bridge-pipeline-dialog-file-text">{fileText}</pre>
    </Dialog>
  );
}
