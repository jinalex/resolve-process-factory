% Text
% In 2017, Alice was paid $33200. She is allowed a deduction of $1200 for the year 2017 for donating cash to charity.

% Question
% Alice's deduction for 2017 falls under section 63(d). Entailment

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
deduction_("a deduction").
agent_("a deduction","Alice").
start_("a deduction","2017-12-31").
amount_("a deduction",1200).

% Test
:- s63_d("Alice",_,1200,2017).
:- halt.
