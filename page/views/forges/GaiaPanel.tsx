/**
 * The Forges view's Gaia panel (SCREENS A4), beside this machine's: the two settings checkboxes, "What notifies" at the end of the second, the line of a
 * settings file Gaia cannot use, the refusal of a change it sent, and Gaia's facts, a path among them breaking after a slash. It takes no hooks: the
 * content and the handlers come in as props, so a spec unfolds it whole. `SettingsRefusalLine` is shared with the "What notifies" list.
 */
import { Fragment, type ReactNode } from 'react';

import type { CommandSubject }                                      from '../../api/CommandSender.ts';
import { Checkbox }                                                 from '../../design-system/Checkbox.tsx';
import { type Fact, FactList }                                      from '../../design-system/FactList.tsx';
import { MicroCapsLabel }                                           from '../../design-system/MicroCapsLabel.tsx';
import { Refusal }                                                  from '../../design-system/Refusal.tsx';
import type { GaiaPanelContent, SettingsCheckbox, SettingsRefusal } from './GaiaPanelModel.ts';

export interface GaiaPanelHandlers {
  readonly onSettingsCheckbox: (checkbox: SettingsCheckbox) => void;
  readonly onOpenWhatNotifies: () => void;
  readonly onDismissFailure:   (subject: CommandSubject) => void;
}

export interface GaiaPanelProps {
  readonly content:  GaiaPanelContent;
  readonly handlers: GaiaPanelHandlers;
}

const GAIA_HEAD_ID = 'gaia-forges-gaia-head';

const SETTINGS_SUBJECT: CommandSubject = { fleetCommand: 'settings-set' };

const PATH_SEPARATOR = '/';

/** The aside narrows to give the Forges table room, so a path may break after a slash rather than inside a name. */
function withBreaksAfterSlashes(value: ReactNode): ReactNode {
  if (typeof value !== 'string' || !value.includes(PATH_SEPARATOR)) return value;
  const segments = value.split(PATH_SEPARATOR);
  const lastSegment = segments.pop() ?? '';
  return [...segments.map((segment, i) => <Fragment key={i}>{segment}{PATH_SEPARATOR}<wbr /></Fragment>), lastSegment];
}

function breakableFactOf(fact: Fact): Fact {
  return { ...fact, value: withBreaksAfterSlashes(fact.value) };
}

export function SettingsCheckboxView({ checkbox, handlers }: { readonly checkbox: SettingsCheckbox; readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox'> }) {
  return (
    <Checkbox
      label={checkbox.label}
      checked={checkbox.checked}
      disabled={checkbox.disabled}
      onChange={() => handlers.onSettingsCheckbox(checkbox)}
      {...(checkbox.explanation === null ? {} : { explanation: checkbox.explanation })}
    />
  );
}

export function SettingsRefusalLine({ refusal, handlers }: {
  readonly refusal:  SettingsRefusal | null;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox' | 'onDismissFailure'>;
}) {
  if (refusal === null) return null;
  const { retryCheckbox } = refusal;
  return (
    <Refusal
      commandLabel={refusal.commandLabel}
      code={refusal.code}
      sentence={refusal.sentence}
      onDismiss={() => handlers.onDismissFailure(SETTINGS_SUBJECT)}
      onTryAgain={() => handlers.onSettingsCheckbox(retryCheckbox)}
    />
  );
}

export function GaiaPanel({ content, handlers }: GaiaPanelProps) {
  return (
    <section className="gaia-forges-gaia" aria-labelledby={GAIA_HEAD_ID}>
      <MicroCapsLabel element="h2" id={GAIA_HEAD_ID} text="Gaia" />
      {content.settingsFileLine === null ? null : <p className="gaia-forges-gaia-settings-file">{content.settingsFileLine}</p>}
      <SettingsCheckboxView checkbox={content.startAtLogin} handlers={handlers} />
      <div className="gaia-forges-gaia-notify">
        <SettingsCheckboxView checkbox={content.notify} handlers={handlers} />
        <button type="button" className="gaia-forges-gaia-what-notifies" onClick={handlers.onOpenWhatNotifies}>What notifies</button>
      </div>
      <SettingsRefusalLine refusal={content.refusal} handlers={handlers} />
      <FactList facts={content.facts.map(breakableFactOf)} />
    </section>
  );
}
