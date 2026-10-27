# Example cases

Six full document sets, written before the other 54 to set the style. Each folder holds what the agent can open (the application, the documents the customer attached, vendor results as JSON, and anything it only finds by looking further) plus `truth.json`.

`truth.json` holds raw facts only: who owns what and through which chain, what each check returned, and the review date. It never states an outcome. The evaluator in `core/` works out ownership, the filing's age and the outcome from those facts using the reference spec (`spec/kyb-v1.json`). Run `npm run examples` to see them, and `npm test` to check them against the outcomes below.

| Case | Trap | Right outcome (SOP as written) |
| --- | --- | --- |
| EX-1 Northwind Coffee Co. LLC | The 40% owner is a company. Delaware doesn't list its members, so the agent must request its certification, which shows a PEP owns all of it. | Escalate (4.3) |
| EX-2 Bluefin Logistics LLC | The cap table and certification cover the voting 70%; the agreement says 30% more exists, holders unlisted. Plus a name-only blog post too weak to count under 4.4. | Request documents (3.3) |
| EX-3 Cedar Ridge Payments, Inc. | Licensed money transmitter; 5.3 says it may be approved, but 5.2 wins. | Escalate (5.2) |
| EX-4 Larkspur Health Foundation | Nonprofit, so no owners needed; the last registry filing is 14 months old (page 2). | Request documents (3.5) |
| EX-5 Opal Trading GmbH | German company, all screening clear, shareholder list says Hamburg; the October ID check shows the 30% owner moved to Tehran in August. | Decline (6.1) |
| EX-6 Sable & Finch LLC | The control person is a PEP; the other owner's sanctions check is still pending. | Escalate (4.3), with a note that the pending check could still mean decline |
