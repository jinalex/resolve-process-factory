# What the expenses pack supplies

The facts `packs/expenses/claim.ts` hands the rules, and what each one means. These are facts, not decisions: which of them matter, and what follows from them, is the spec's to say. Claude reads this page when it drafts a spec from the SOP (`pnpm propose-spec`).

## The claim

- `self_approved`: the claim's approver is the employee who submitted it.
- `director_signed`: the Finance Director has signed the claim off.

## Lines (`lines`, one item per receipt or expense)

- `category`: what the line is for.
- `cabin`: for airfare, the cabin class.
- `amount_band`: whether the line's amount is under $75 or $75 or more.
- `itemised_receipt`: an itemised receipt is attached for the line.
- `recipient_official`: for a gift, the recipient is a government official.
- `pre_approved`: the line was pre-approved in writing by the Finance Director.

## Computed by the pack

- `total_usd`: the claim's total, in dollars.
- `days_to_submit`: days from the earliest expense on the claim to its submission.
