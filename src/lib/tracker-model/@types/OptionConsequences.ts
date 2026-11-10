/**
 * What an option of an agent's question does, as the agent states it with `question options` before it asks: AskUserQuestion carries only
 * a label and a description, so the facts travel beside the question and the decision the question opens takes them.
 */

/** Each fact is written only once the agent gave it. */
export interface OptionConsequences {
  /** The repository paths the option changes. */
  touches?:          string[];
  /** What User gets and what User loses. */
  tradeOff?:         string;
  /** What the option does to the ticket's Acceptance items, by their labels, such as "A2 fails". */
  acceptanceEffect?: string;
}

export interface OptionNote extends OptionConsequences {
  label: string;
}

/** The notes for one question the agent is about to ask, matched to it by the question's text and to each option by its label. */
export interface QuestionOptionNotes {
  question: string;
  options:  OptionNote[];
}
