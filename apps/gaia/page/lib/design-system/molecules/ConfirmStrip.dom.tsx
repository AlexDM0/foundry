/**
 * The confirm strip: a group named by its label holding the question, then the consequence and choices only when given, then the confirming
 * control and Cancel, which calls `onCancel`; the tone sets `data-tone`; the strip's small type stays on its own line, so a choice reads as it
 * does outside; and the words are text, never markup.
 */
import { readFileSync } from 'node:fs';

import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ChoiceInput, ChoiceOption } from './ChoiceOption.tsx';
import { ConfirmStrip }              from './ConfirmStrip.tsx';

const STYLESHEETS_OF_THE_STRIP_AND_ITS_CHOICES = ['../styles/tokens.css', '../styles/base.css', './ConfirmStrip.css', './ChoiceOption.css'];

function exampleChoice(label: string) {
  return (
    <ChoiceOption
      label={label}
      description="The example step finishes first."
      chosen={false}
      variant="card"
      input={<ChoiceInput type="radio" name={label} checked={false} accessibleName={label} onChange={() => undefined} />}
    />
  );
}

function typeOf(element: Element | null | undefined): [string, string] {
  if (!element) return ['absent', 'absent'];
  const computedStyle = getComputedStyle(element);
  return [computedStyle.fontSize, computedStyle.color];
}

afterEach(() => {
  cleanup();
});

describe('the confirm strip', () => {
  test('a group named by its label: the question, the consequence, the confirming control, then Cancel', () => {
    render(
      <ConfirmStrip
        label="Confirm stopping J4"
        question="Stop J4 now?"
        consequence="#004 stays in progress."
        tone="danger"
        confirm={<button type="button">Confirm stop</button>}
        cancelLabel="Cancel"
        onCancel={() => undefined}
      />,
    );
    const strip = screen.getByRole('group', { name: 'Confirm stopping J4' });
    expect([
      strip.querySelector('.design-system-confirm-question')?.textContent,
      strip.querySelector('.design-system-confirm-consequence')?.textContent,
      [...strip.querySelectorAll('.design-system-confirm-actions button')].map((button) => button.textContent),
      strip.getAttribute('data-tone'),
    ]).toEqual(['Stop J4 now?', '#004 stays in progress.', ['Confirm stop', 'Cancel'], 'danger']);
  });

  test('without a consequence only the question shows, and Cancel calls onCancel', () => {
    const cancels: string[] = [];
    render(
      <ConfirmStrip
        label="Confirm stopping the server"
        question="Stop the server?"
        tone="neutral"
        confirm={<button type="button">Confirm stop</button>}
        cancelLabel="Cancel"
        onCancel={() => cancels.push('cancel')}
      />,
    );
    const strip = screen.getByRole('group', { name: 'Confirm stopping the server' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect([strip.querySelector('.design-system-confirm-consequence'), strip.querySelector('.design-system-confirm-text')?.textContent, strip.getAttribute('data-tone'), cancels])
      .toEqual([null, 'Stop the server?', 'neutral', ['cancel']]);
  });

  test('choices sit between the question and the actions, and a strip without them holds no part for them', () => {
    const { container } = render(
      <>
        <ConfirmStrip
          label="Confirm stopping J4"
          question="How should J4 stop?"
          choices={<><button type="button">Finish the step</button><button type="button">Stop now</button></>}
          tone="neutral"
          confirm={<button type="button">Stop</button>}
          cancelLabel="Cancel"
          onCancel={() => undefined}
        />
        <ConfirmStrip
          label="Confirm stopping J5"
          question="Stop J5 now?"
          tone="neutral"
          confirm={<button type="button">Stop</button>}
          cancelLabel="Cancel"
          onCancel={() => undefined}
        />
      </>,
    );
    const [withChoices, withoutChoices] = [...container.querySelectorAll('.design-system-confirm')];
    expect([...withChoices?.children ?? []].map((part) => part.className))
      .toEqual(['design-system-confirm-text', 'design-system-confirm-choices', 'design-system-confirm-actions']);
    expect([...withChoices?.querySelectorAll('.design-system-confirm-choices button') ?? []].map((choice) => choice.textContent)).toEqual(['Finish the step', 'Stop now']);
    expect([withChoices?.hasAttribute('data-with-choices'), withoutChoices?.hasAttribute('data-with-choices')]).toEqual([true, false]);
    expect(withoutChoices?.querySelector('.design-system-confirm-choices')).toBeNull();
  });

  test('a choice in either tone reads in the type and ink it has outside the strip, not the strip\'s small muted line', () => {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = STYLESHEETS_OF_THE_STRIP_AND_ITS_CHOICES.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    document.head.append(stylesheet);
    const { container } = render(
      <>
        {exampleChoice('Outside the strip')}
        {(['neutral', 'danger'] as const).map((tone) => (
          <ConfirmStrip
            key={tone}
            label={`Confirm the ${tone} example`}
            question="How should the example build stop?"
            choices={exampleChoice(`Inside the ${tone} strip`)}
            tone={tone}
            confirm={<button type="button">Stop</button>}
            cancelLabel="Cancel"
            onCancel={() => undefined}
          />
        ))}
      </>,
    );
    const choiceTypes = [...container.querySelectorAll('.design-system-choice')]
      .map((choice) => [typeOf(choice), typeOf(choice.querySelector('.design-system-choice-description'))]);
    stylesheet.remove();
    const outsideTheStrip = choiceTypes[0] ?? [];
    expect(typeOf(container.querySelector('.design-system-confirm-text'))).not.toEqual(outsideTheStrip[0]);
    expect(choiceTypes).toEqual([outsideTheStrip, outsideTheStrip, outsideTheStrip]);
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    render(<ConfirmStrip label={planted} question={planted} consequence={planted} tone="neutral" confirm={null} cancelLabel={planted} onCancel={() => undefined} />);
    expect(screen.getByRole('group', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
