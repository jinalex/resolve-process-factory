% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Bob is allowed an itemized deduction of $4324. Alice and Bob file separate returns.

% Question
% Section 63(c)(6)(A) applies to Alice for 2017. Entailment

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2017-02-03").
deduction_("an itemized deduction").
agent_("an itemized deduction","Bob").
start_("an itemized deduction","2017-12-31").

% Test
:- s63_c_6_A("Alice",_,_,2017).
:- halt.
