# The agent asks on the document

How a spec or plan agent's clarifying question shows on a ticket's document page, how User answers it, and how it holds the document's
approval. The look is taken from artboard 11 of the spec and plan design ("The spec agent asks you on the spec", `Agent-asks.dc.html`,
1440 × 900, light, interactive: an option is picked and Answer pressed); its dark theme is Gaia's tokens' dark values. The behaviour is the
owner's. A question is an open `agent-question` decision whose `document`, `anchor` and `placement` forge serves; its answer is the
document's message naming the decision (`docs/forge-requirements.md` V15).

Built in: `page/board/views/documents/` (`DocumentQuestionsModel.ts`, `DocumentQuestionCard.tsx`, and the page, Preview, chat, strip and
head they feed), `page/board/shell/BoardRouter.ts` (the line of a documents route), the Questions view's link, styled by
`page/styles/board/documents.css`. Held by: their specs beside them, and `page/Screens.visual.spec.ts`, which paints artboard 11 from
`SPEC_ASKS_DOCUMENTS` and `SAVED_CHOICE_QUESTION` (`page/board/testing/TicketDocumentsFixture.ts`): E7 open, E8 answered.

## The head

- The breadcrumb: the forge's name › Tickets › the segment the ticket stands in (In draft, Active or Finished, `tickets.md`) › `#004`
  and the title. The forge's name opens the board at the tab used last; Tickets opens Tickets; the segment opens `tickets/<segment>`;
  the ticket's crumb, in ink, opens its detail on Tickets. 13px, muted, `›` between.
- "Next waiting on you ›", orange and underlined, after the head's gap, before Preview · Code · Split: the next row of In draft's
  "Waiting on you" after this ticket, oldest wait first, round to the first; it opens what that row's action opens. Absent while no other
  draft waits on User.
- While the agent's questions on the shown document are open, beside the primary button: "1 question open", "2 questions open" (12px,
  weight 600, orange), and "Approve spec · start Plan" (the plan's "Approve plan · start build") is disabled, its tooltip and accessible
  name "Answer the open questions first.". Should forge refuse an approval anyway (a question asked since the page read the board), its
  sentence shows beside the button verbatim.

## In the document

- The text of the lines a question stands on now (its `placement`) is marked: the orange tint over a 2px orange rule. Each Markdown text
  span holds one source line, so exactly the text written on those lines is marked.
- After that text, glued to its last word, a solid orange pill in mono 11px: `E7` (the surface colour on the link orange, in both themes).
  Answered, it reads `✓ E7`, still solid, the text still marked, until the agent's edit for the answer is applied: then the chip takes an
  applied comment's look (muted, on the strong line) and the mark goes.
- Under the document's own heading named "Open questions" (with or without its section number), one line a question, in the order asked:
  the id as an orange mono link that unfolds its card in the chat, then the question and "waiting on you" (12px, orange) while open, or
  "Answered: <label>." once answered, until its edit is applied. A document with no such heading lists nothing.

## In the agent's chat

The agent's head reads "Waiting on your 1 answer · reads v4" ("2 answers"), its dot dashed orange, and its strip "Waiting on you · 1
question to answer", while questions are open and it is not working; a question waits before an edit to review.

### An open question

The card stands last in the chat, as it waits: 10px radius, 1px orange edge, 12 × 14 padding, 10px between its parts.

1. The anchor line, 12px muted: the id in mono, orange, weight 600, then "· § 3 Behaviour · line 16". The section is read from the head at
   the question's lines, as a comment's is, so the document's title never leads it. A press scrolls the document to the lines. Lines gone
   from the head read "· gone from the head" and press nothing.
2. The question, 14px, weight 600.
3. Its context, 12px muted: what the agent found that makes it ask. Absent when the agent gave none.
4. Two to four lettered options (A, B, C, D as shown; `a` to `d` as forge takes them), each a card: its letter, its label, then under it
   "Recommended" (one option at most), "Touches" and the paths in mono, and the effect on the Acceptance, one 12px muted line each. The
   chosen one has the orange tint and edge. The recommended option is chosen as the card opens.
5. "Or answer in your own words" (micro capitals) over a two-line field, placeholder "Optional note for the spec agent".
6. "The answer goes on the ticket and to the agent." (12px muted) and the primary small button "Answer A", named for the chosen option,
   "Answer" with none.

Answer sends `decision-answer` with the chosen letter and, when typed, the note; with no option chosen, the note alone as free text.
Answer is disabled with neither.

One open card is unfolded at a time: the one at the line a route named, else the one User unfolded, else the first asked. Each other folds
to one line on the strong line: its anchor line, its question, and its options as "A · label · B · label"; a press unfolds it. The chat
opens with the unfolded card's top at its own.

### An answered question

Where the answer's message stands in the chat (before the agent's turn that took it), the card on the strong line: the anchor line, the
question, "✓ You answered **<label>**" (the tick in the done ink), User's note in quotes, muted. While the agent is still in a turn, the
answer waits as this card after the turns, "Goes to the agent once it ends its turn.", never in the queue under the composer. The agent's
reply and its proposed edit follow as any turn's.

## The Questions tab

A spec or plan agent's question lists there as every decision and is answered there as well. Beside "Open beside the board", "Open the
spec at line 16" opens `documents/ticket/<id>/<spec|plan>/line/<n>`, at the line it stands on now, else where it was asked. That route
scrolls the document to the line and unfolds the question there; a later link to another line scrolls the page already open.

## Deviations from the artboard

- **No Change after answering.** Forge settles a decision with its answer and offers no way to answer it again, so the answered card has
  no Change; User says more to the agent in the chat.
- **The answered line names the label, not its letter.** Once settled, the decision is gone from the board, and forge's answer message
  and log keep the option's label, not its letter: "✓ You answered **Keep their colours, as A4 says**".
- **Each option shows its radio**, as every choice in Gaia (`ChoiceOption`), and "Recommended" is the design system's mark under the label
  rather than orange text beside it: the rail's card has no room for a mark column.
- **The option's facts** are forge's: the paths it touches in mono and its effect on the Acceptance, as the agent wrote them.
- **The anchor line** names no "also the diagram": forge's anchor names lines, not what else they feed.
- **The intro line under the agent's turn** ("Asked E7, E8 · spec v4") is not drawn: the cards below say the same.
- **The fallback sentence is a line of its own** in the fixture, so the line the agent asks on holds just that sentence, as the artboard
  marks it; forge anchors a question on lines, never on part of one.
