/**
 * The Forges view's Gaia panel (`docs/design/screens.md`, "Forges and this machine"): the notifications switch with "What notifies" behind a ?, the
 * line of a settings file Gaia cannot use, a refusal, and Gaia's facts. It takes no hooks, so a spec unfolds it whole. `SettingsCheckboxView` and
 * `SettingsRefusalLine` are shared with the "What notifies" list.
 */

import { Fragment, type ReactNode } from 'react';

import type { CommandSubject } from '../../api/CommandSender.ts';
import { Refusal }             from '../../components/Refusal.tsx';
import {
  Checkbox,
  IconButton,
  Switch,
  Text
} from '../../lib/design-system/DesignSystemInterface.ts';
import type {
  GaiaFact,
  GaiaPanelContent,
  SettingsCheckbox,
  SettingsRefusal
} from './GaiaPanelModel.ts';

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

const NOTIFY_LABEL_ID = 'gaia-forges-gaia-notify-label';

const SETTINGS_SUBJECT: CommandSubject = { fleetCommand: 'settings-set' };

const PATH_SEPARATOR = '/';

const WHAT_NOTIFIES_LABEL = 'What notifies';

const QUESTION_MARK = '?';

/** The aside narrows to give the Forges table room, so a path may break after a slash rather than inside a name. */
function withBreaksAfterSlashes(value: string): ReactNode {
  if (!value.includes(PATH_SEPARATOR)) return value;
  const segments = value.split(PATH_SEPARATOR);
  const lastSegment = segments.pop() ?? '';
  return [...segments.map((segment, i) => <Fragment key={i}>{segment}{PATH_SEPARATOR}<wbr /></Fragment>), lastSegment];
}

/**
 * The panel sets a path fact's label over its value, which the package's fact list does not; a machine value carries its own mono face. This
 * Gaia's facts close the list, each a label and its value on one line.
 */
function GaiaFacts({ facts, thisGaiaFacts }: { readonly facts: readonly GaiaFact[]; readonly thisGaiaFacts: readonly GaiaFact[] }) {
  return (
    <dl className="gaia-forges-gaia-facts">
      {facts.map((fact) => (
        <div key={fact.label} className="gaia-forges-gaia-fact">
          <dt>{fact.label}</dt>
          <dd><Text typeRole="small" mono={fact.valueFace !== 'ui'}>{withBreaksAfterSlashes(fact.value)}</Text></dd>
        </div>
      ))}
      {thisGaiaFacts.map((fact) => (
        <div key={fact.label} className="gaia-forges-gaia-this-gaia-fact">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
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

interface SettingsSwitchProps {
  readonly checkbox: SettingsCheckbox;
  readonly labelId:  string;
  readonly handlers: Pick<GaiaPanelHandlers, 'onSettingsCheckbox'>;
  /** What follows the label, such as the "What notifies" button, outside the label so it names nothing. */
  readonly beside?:  ReactNode;
}

/** A setting of the panel as the package's switch, named by its visible label. */
function SettingsSwitch({
  checkbox, labelId, handlers, beside
}: SettingsSwitchProps) {
  return (
    <div className="gaia-forges-gaia-setting">
      <span className="gaia-forges-gaia-setting-text">
        <span className="gaia-forges-gaia-setting-label" id={labelId}>{checkbox.label}</span>
        {beside}
      </span>
      <Switch
        accessibleName={checkbox.label}
        labelledBy={labelId}
        checked={checkbox.checked}
        disabled={checkbox.disabled}
        onToggle={() => handlers.onSettingsCheckbox(checkbox)}
      />
    </div>
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
      refusedBy={refusal.refusedBy}
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
      <Text typeRole="section" element="h2" id={GAIA_HEAD_ID}>Gaia</Text>
      {content.settingsFileLine === null ? null : <p className="gaia-forges-gaia-settings-file">{content.settingsFileLine}</p>}
      <div className="gaia-forges-gaia-notify">
        <SettingsSwitch
          checkbox={content.notify}
          labelId={NOTIFY_LABEL_ID}
          handlers={handlers}
          beside={<IconButton drawing={QUESTION_MARK} accessibleName={WHAT_NOTIFIES_LABEL} title={WHAT_NOTIFIES_LABEL} onPress={handlers.onOpenWhatNotifies} />}
        />
      </div>
      <SettingsRefusalLine refusal={content.refusal} handlers={handlers} />
      <GaiaFacts facts={content.facts} thisGaiaFacts={content.thisGaiaFacts} />
    </section>
  );
}
