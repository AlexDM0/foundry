/**
 * The ask item, in a happy-dom document. What matters: its kind, mono id, tickets, question and meta all show, since a line of it is all
 * User sees before acting; a row is an entry of its caller's list and a strip is not; the kind's state colours the item, a row's label in
 * its ink and a strip's in small link-coloured words, and an escalated item says so; its age is a stamp whose full text shows on hover,
 * and with no age no time is invented; an empty meta adds no line; every value is text, never markup; and a ticket link outside a mounted
 * board refuses to draw.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { Button } from 'design-system/Button';

import { BoardTrackerContext }        from '../shell/BoardRouteLinks.ts';
import { AskItem, type AskItemProps } from './AskItem.tsx';
import { TicketLinks }                from './ConversationParts.tsx';

afterEach(() => {
  cleanup();
});

const ITEM_ABOUT_NO_TICKET: AskItemProps = {
  layout:       'row',
  kind:         { text: 'Question', tone: 'state', state: 'ready-for-review' },
  decisionId:   'E4',
  questionText: 'Account pages dark mode: keep the zebra rows?',
  meta:         ['asked by builder', 'job J4'],
  age:          { shortText: '9m', fullText: 'opened 2026-11-09 14:11:02' },
  action:       <Button label="Answer" emphasis="primary" href="#forge/example-tracker/questions/E4" />,
  escalated:    false,
};

const QUESTION_ITEM: AskItemProps = {
  ...ITEM_ABOUT_NO_TICKET,
  subject: <BoardTrackerContext.Provider value="example-tracker"><TicketLinks ticketIds={['004']} /></BoardTrackerContext.Provider>,
};

describe('a board link', () => {
  test('outside a mounted board it refuses to draw rather than name an empty tracker', () => {
    expect(() => render(<TicketLinks ticketIds={['004']} />)).toThrow('no BoardTrackerContext names its tracker');
  });
});

describe('the ask item', () => {
  test('its kind, id, tickets, question, meta, age and action all show', () => {
    const { container } = render(<ul><AskItem {...QUESTION_ITEM} /></ul>);
    const item = container.querySelector('.board-ask');
    expect([
      item?.querySelector('.design-system-micro-caps')?.textContent,
      item?.querySelector('.design-system-mono-id')?.textContent,
      screen.getByRole('link', { name: '#004' }).getAttribute('href'),
      item?.querySelector('.board-ask-text')?.textContent,
      item?.querySelector('.board-card-meta')?.textContent,
      screen.getByRole('link', { name: 'Answer' }).getAttribute('href'),
    ]).toEqual([
      'Question',
      'E4',
      '#forge/example-tracker/tickets/ticket-row/004',
      'Account pages dark mode: keep the zebra rows?',
      'asked by builder · job J4',
      '#forge/example-tracker/questions/E4',
    ]);
  });

  test('a row is a list entry and a strip is not, each naming its layout', () => {
    const { container } = render(
      <>
        <ul><AskItem {...QUESTION_ITEM} /></ul>
        <AskItem {...QUESTION_ITEM} layout="strip" />
      </>,
    );
    expect([...container.querySelectorAll('.board-ask')].map((item) => [item.tagName, item.getAttribute('data-layout')])).toEqual([
      ['LI', 'row'],
      ['DIV', 'strip'],
    ]);
  });

  test('the kind\'s state colours the item and a row\'s label reads that state\'s ink', () => {
    const { container } = render(<ul><AskItem {...QUESTION_ITEM} layout="row" kind={{ text: 'Asks User', tone: 'state', state: 'in-review' }} /></ul>);
    expect([
      container.querySelector('.board-ask')?.getAttribute('data-state'),
      container.querySelector('.design-system-micro-caps')?.getAttribute('data-tone'),
    ]).toEqual(['in-review', 'state']);
  });

  test('a strip says its kind in small words in the link colour, not in small capitals', () => {
    const { container } = render(<AskItem {...QUESTION_ITEM} layout="strip" kind={{ text: 'Asks User', tone: 'state', state: 'in-review' }} />);
    const kind = container.querySelector('.board-ask-strip-kind > .design-system-text');
    expect([kind?.textContent, kind?.getAttribute('data-type-role'), container.querySelector('.design-system-micro-caps')]).toEqual(['Asks User', 'small', null]);
  });

  test('an escalated item says so, and another does not', () => {
    const { container } = render(
      <ul>
        <AskItem {...QUESTION_ITEM} escalated kind={{ text: 'Escalated', tone: 'error' }} />
        <AskItem {...QUESTION_ITEM} decisionId="E5" />
      </ul>,
    );
    expect([...container.querySelectorAll('.board-ask')].map((item) => item.hasAttribute('data-escalated'))).toEqual([true, false]);
  });

  test('its age is a stamp with the full text on hover, and with no age no time shows', () => {
    const { container, rerender } = render(<ul><AskItem {...QUESTION_ITEM} /></ul>);
    const stamp = container.querySelector('.board-ask-side .design-system-stamp');
    expect([stamp?.textContent, stamp?.getAttribute('title')]).toEqual(['9m', 'opened 2026-11-09 14:11:02']);
    rerender(<ul><AskItem {...QUESTION_ITEM} age={null} /></ul>);
    expect(container.querySelector('.design-system-stamp')).toBeNull();
  });

  test('an item with no meta and no tickets adds neither', () => {
    const { container } = render(<ul><AskItem {...ITEM_ABOUT_NO_TICKET} meta={[]} /></ul>);
    expect([container.querySelector('.board-card-meta'), container.querySelector('.board-ask-line')?.textContent]).toEqual([null, 'QuestionE4']);
  });

  test('every value is text, never markup', () => {
    const { container } = render(
      <ul>
        <AskItem {...QUESTION_ITEM} kind={{ text: '<b>planted</b>', tone: 'muted' }} decisionId="<b>planted</b>" questionText="<b>planted</b>" meta={['<b>planted</b>']} />
      </ul>,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('.board-ask-text')?.textContent).toBe('<b>planted</b>');
  });
});
