Record a business question (pricing, legal, payments, operations) in docs/03_DECISIONS.md instead of guessing. The question: $ARGUMENTS (if empty, use the open question from our current work; if there is none, ask me what it is).
1. Read docs/03_DECISIONS.md. If the question is already there (Settled, Proposed or Open), show me that entry and stop. Do not add duplicates, and never re-open a Settled item unless I ask.
2. Add it as the next number in the Open list (one number higher than the highest Open item anywhere in the file), on one line: the question, the options (A, B, ...), and what work it blocks ("blocks nothing yet" if none).
3. Add a line to the Log: `- <today's date>: Opened item <N> (<few words>).`
4. Ask me the question in plain words: the options, what changes with each, and your recommendation with one reason. Say if you are unsure.
5. When I answer: add it to Settled with the date, mark the Open item the way item 1 is marked (`~~question~~ SETTLED <date>: <answer>`), and add a Log line.
6. Do not write code that depends on the answer until it is Settled. Work on something it does not block instead.
