/**
 * The state of one entity's constitution as a tag, its meaning in the title, as MonoConstitution's legend draws them: Adopted in the
 * success tone, Drafted on the wash, Default dashed, Not started outlined, and a root kept for a person as quiet text.
 */
import { Tag, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { ConstitutionStateTagModel, type ConstitutionState } from './ConstitutionStateTagModel.ts';

export interface ConstitutionStateTagProps {
  readonly state: ConstitutionState;
}

export function ConstitutionStateTag({ state }: ConstitutionStateTagProps) {
  const text = ConstitutionStateTagModel.textOf(state);
  const title = ConstitutionStateTagModel.titleOf(state);
  switch (state) {
    case 'adopted':
      return <Tag text={text} tone="state" stateTone="success" title={title} />;
    case 'drafted':
      return <Tag text={text} tone="neutral" title={title} />;
    case 'default':
      return <Tag text={text} tone="neutral" dashed title={title} />;
    case 'not-started':
      return <Tag text={text} tone="state" stateTone="muted" title={title} />;
    case 'kept-for-a-person':
      return <span title={title}><Text typeRole="small" subtle>{text}</Text></span>;
  }
}
