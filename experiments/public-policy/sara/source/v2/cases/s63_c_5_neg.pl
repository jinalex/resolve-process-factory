% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Bob earned $10 in 2017. Alice and Bob file separate returns. Alice is not entitled to a deduction for Bob under section 151.

% Question
% Section 63(c)(5) applies to Bob's basic standard deduction in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
payment_("earned").
patient_("earned","Bob").
start_("earned","2017-12-31").
amount_("earned",10).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2017-02-03").

% Test
:- \+ s63_c_5("Bob",_,_,2017,500).
:- halt.
