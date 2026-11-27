/**
 * Questions reach User wherever User is: the open-question count leads the tab title, and a decision opened while the board is up raises
 * one browser notification once User allowed them from a click. The board never asks for the permission on load, and the decisions on
 * the first board it shows raise none, since User sees them there.
 */
import { useEffect, useRef } from 'react';

import type { BoardDecisionDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import { NotificationBoundary }       from '../../../notifications/NotificationBoundary.ts';
import type { QuestionNotifier }      from '../../@types/QuestionNotifier.ts';
import { QuestionsModelUtil }         from './QuestionsModel.ts';

/** The notifier of the browser's page: its notifications through `NotificationBoundary`, its tab title through the document. */
function browserQuestionNotifier(): QuestionNotifier {
  return {
    ...NotificationBoundary.browserNotifications(),
    setDocumentTitle: (title) => {
      document.title = title;
    },
    baseDocumentTitle: document.title,
  };
}

function notificationBodyOf(decision: BoardDecisionDocument): string {
  return decision.questions[0]?.question ?? decision.context;
}

/** Keeps the tab title and the notifications in step with the open decisions; `null` before the first board. */
function useOpenQuestionAlerts(decisions: readonly BoardDecisionDocument[] | null, notifier: QuestionNotifier): void {
  const seenDecisionIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (decisions === null) return;
    notifier.setDocumentTitle(QuestionsModelUtil.tabTitleOf(notifier.baseDocumentTitle, decisions.length));
    const seen = seenDecisionIds.current;
    if (seen !== null) {
      for (const decision of QuestionsModelUtil.newDecisionsOf(seen, decisions)) notifier.notify(`Question ${decision.id}`, notificationBodyOf(decision));
    }
    seenDecisionIds.current = new Set([...seen ?? [], ...decisions.map((decision) => decision.id)]);
  }, [decisions, notifier]);
}

export const QuestionAlerts = Object.freeze({ browserQuestionNotifier, useOpenQuestionAlerts });
