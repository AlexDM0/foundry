/**
 * The state of one entity's constitution as a tag, its meaning in the title: Adopted and Drafted in their state tones, Default plain,
 * Not started dashed, and a root kept for a person as quiet text.
 */
import { Tag }  from 'design-system/Tag';
import { Text } from 'design-system/Text';

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
      return <Tag text={text} tone="state" stateTone="accent" title={title} />;
    case 'default':
      return <Tag text={text} tone="neutral" title={title} />;
    case 'not-started':
      return <Tag text={text} tone="neutral" dashed title={title} />;
    case 'kept-for-a-person':
      return <span title={title}><Text typeRole="small" subtle>{text}</Text></span>;
  }
}
