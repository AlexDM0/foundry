import type { NotificationAllowance } from '../../notifications/NotificationBoundary.ts';

export interface QuestionNotifier {
  readonly allowance:         () => NotificationAllowance;
  /** Asks the browser, from a click of User's; resolves to what User chose. */
  readonly askAllowance:      () => Promise<NotificationAllowance>;
  readonly notify:            (title: string, body: string) => void;
  readonly setDocumentTitle:  (title: string) => void;
  readonly baseDocumentTitle: string;
}
