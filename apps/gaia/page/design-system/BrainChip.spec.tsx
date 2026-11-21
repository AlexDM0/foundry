/**
 * Flint's brain in B1's bar, in each of its five states. What matters: each state shows exactly its parts of SCREENS B1 and nothing of
 * another: off the Wake button with its diamond; starting the starting dot and its note as a status; running the orange chip with the
 * model, the effort, the countdown and the tokens it is given, the figures in mono, and Stop brain named "Stop Flint's brain on <forge>"; refused
 * the forge's refusal on one line, its sentence apart from its code so that only the sentence is cut short, whole in its title, then Wake
 * again; ended the grey diamond and the forge's sentence with no button.
 * A control the forge does not take is absent, and one on its way is disabled. The chip computes nothing: the countdown it shows is the
 * text it is given.
 */
import { describe, expect, test } from 'bun:test';
import { StateDot }               from 'design-system/StateDot';

import { DrawnDots }                          from '../testing/DrawnDots.ts';
import { PackageButtons }                     from '../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree } from '../testing/ReactElementTree.ts';
import { BrainChip, type BrainChipProps }     from './BrainChip.tsx';

function chipOf(props: BrainChipProps) {
  return ReactElementTree.unfolded(<BrainChip {...props} />);
}

function buttonsOf(unfolded: ReturnType<typeof chipOf>): HostElement[] {
  return PackageButtons.buttonsIn(unfolded);
}

const RUNNING: BrainChipProps = {
  state:     'running',
  forgeName: 'Example Storefront',
  model:     'haiku',
  effort:    'low',
  countdown: '1:24',
  tokens:    '3.1k',
  stop:      { onPress: () => undefined, disabled: false },
};

describe('the brain chip', () => {
  test('off: the Wake button with its diamond, which wakes the brain', () => {
    const presses: string[] = [];
    const unfolded = chipOf({ state: 'off', wake: { onPress: () => presses.push('wake'), disabled: false } });
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-group').props['data-state']).toBe('off');
    const [wake, ...others] = buttonsOf(unfolded);
    if (wake === undefined) throw new Error('The Wake button is missing.');
    expect([others, PackageButtons.labelOf(wake), wake.props['disabled']]).toEqual([[], 'Wake Flint\'s brain', false]);
    expect(ReactElementTree.hostElementsIn(ReactElementTree.unfoldedProp(wake, 'leading'), DrawnDots.isDot).map(DrawnDots.roleOf)).toEqual(['brain']);
    PackageButtons.press(wake);
    expect(presses).toEqual(['wake']);
  });

  test('off: the Wake button is disabled while its command is on its way, and absent where the forge takes no brain command', () => {
    const [wake] = buttonsOf(chipOf({ state: 'off', wake: { onPress: () => undefined, disabled: true } }));
    expect(wake?.props['disabled']).toBe(true);
    expect(buttonsOf(chipOf({ state: 'off', wake: null }))).toEqual([]);
  });

  test('starting: the starting dot and "Waking Flint\'s brain…" as a status, with no button', () => {
    const unfolded = chipOf({ state: 'starting' });
    const note = ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-note');
    expect([note.props['role'], ReactElementTree.textOf([note])]).toEqual(['status', 'Waking Flint\'s brain…']);
    const dot = ReactElementTree.onlyOfComponent(unfolded, StateDot);
    expect([dot.props['tone'], dot.props['shape']]).toEqual(['accent', 'ring']);
    expect(buttonsOf(unfolded)).toEqual([]);
  });

  test('running: the chip with the model, effort, countdown and tokens it is given, the figures in mono, and Stop named for the forge', () => {
    const presses: string[] = [];
    const unfolded = chipOf({ ...RUNNING, stop: { onPress: () => presses.push('stop'), disabled: false } } as BrainChipProps);
    const chip = ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip');
    expect(ReactElementTree.textOf([chip])).toBe('Flint\'s brain · haiku low · 1:24 left · 3.1k tokens');
    const figures = ReactElementTree.hostElementsIn([chip], ReactElementTree.withClass('gaia-brain-chip-figure'));
    expect(figures.map((figure) => ReactElementTree.textOf([figure]))).toEqual(['1:24', '3.1k']);
    expect(ReactElementTree.hostElementsIn([chip], DrawnDots.isDot).map(DrawnDots.roleOf)).toEqual(['brain']);
    const [stop, ...others] = buttonsOf(unfolded);
    if (stop === undefined) throw new Error('The Stop button is missing.');
    expect([others, PackageButtons.labelOf(stop), PackageButtons.nameOf(stop), PackageButtons.emphasisOf(stop)])
      .toEqual([[], 'Stop brain', 'Stop Flint\'s brain on Example Storefront', 'quiet']);
    PackageButtons.press(stop);
    expect(presses).toEqual(['stop']);
  });

  test('running: Stop is disabled on its way and absent where the forge takes no brain command, and the chip still shows', () => {
    const [stop] = buttonsOf(chipOf({ ...RUNNING, stop: { onPress: () => undefined, disabled: true } } as BrainChipProps));
    expect(stop?.props['disabled']).toBe(true);
    const withoutStop = chipOf({ ...RUNNING, stop: null } as BrainChipProps);
    expect(buttonsOf(withoutStop)).toEqual([]);
    expect(ReactElementTree.hostElementsIn(withoutStop, ReactElementTree.withClass('gaia-brain-chip'))).toHaveLength(1);
  });

  test('refused: the forge\'s refusal on one line, its sentence apart from its code in mono, whole in its title, as an alert, then Wake again', () => {
    const unfolded = chipOf({
      state: 'refused', refusedBy: 'forge', sentence: 'launches are held until 16:00 (usage limit)', code: 'usage-limit-holds', wake: { onPress: () => undefined, disabled: false },
    });
    const group = ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-group');
    const [first, second] = group.children;
    expect(typeof first === 'object' ? first.props['className'] : null).toBe('gaia-brain-chip-refusal');
    expect(typeof second === 'object' ? second.tag : null).toBe('Button');
    const refusal = ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-refusal');
    expect([refusal.props['role'], refusal.props['title']]).toEqual(['alert', 'The forge refused: launches are held until 16:00 (usage limit) usage-limit-holds']);
    expect(['gaia-brain-chip-refusal-sentence', 'gaia-brain-chip-refusal-code'].map((className) => (
      ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, className)])
    ))).toEqual(['The forge refused: launches are held until 16:00 (usage limit)', 'usage-limit-holds']);
    expect(buttonsOf(unfolded).map(PackageButtons.labelOf)).toEqual(['Wake Flint\'s brain']);
  });

  test('a wake Gaia could not carry out, as when its server did not answer, says Gaia could not wake the brain, not that the forge refused', () => {
    const unfolded = chipOf({
      state: 'refused', refusedBy: 'gaia', sentence: 'Gaia\'s server could not be reached.', code: 'server-unreachable', wake: null
    });
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-refusal').props['title'])
      .toBe('Gaia could not wake Flint\'s brain: Gaia\'s server could not be reached. server-unreachable');
  });

  test('ended: the grey diamond and the forge\'s own sentence, with no button', () => {
    const unfolded = chipOf({ state: 'ended', sentence: 'Flint\'s brain stopped after 2:00 · 4.2k tokens' });
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithClass(unfolded, 'gaia-brain-chip-note')])).toBe('Flint\'s brain stopped after 2:00 · 4.2k tokens');
    expect(['tone', 'shape'].map((propName) => ReactElementTree.onlyOfComponent(unfolded, StateDot).props[propName])).toEqual(['neutral', 'diamond']);
    expect(buttonsOf(unfolded)).toEqual([]);
  });

  test('each state shows only its own parts', () => {
    const partsOf = (props: BrainChipProps) => ReactElementTree.hostElementsIn(chipOf(props), (element) => [
      'gaia-brain-chip', 'gaia-brain-chip-note', 'gaia-brain-chip-refusal',
    ].some((className) => ReactElementTree.hasClass(element, className))).map((element) => element.props['className']);
    expect([
      partsOf({ state: 'off', wake: null }),
      partsOf({ state: 'starting' }),
      partsOf(RUNNING),
      partsOf({
        state: 'refused', refusedBy: 'forge', sentence: 'launches are held', code: 'usage-limit-holds', wake: null
      }),
      partsOf({ state: 'ended', sentence: 'Flint\'s brain stopped.' }),
    ]).toEqual([[], ['gaia-brain-chip-note'], ['gaia-brain-chip'], ['gaia-brain-chip-refusal'], ['gaia-brain-chip-note']]);
  });
});
