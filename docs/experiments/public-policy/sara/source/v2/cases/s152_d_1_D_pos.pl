% Text
% In 2015, Alice's income was $312. The exemption amount for Alice under section 151(d) for the year 2015 was $2000. Bob is Alice's father.

% Question
% Section 152(d)(1)(D) applies to Bob for the year 2015. Entailment

% Facts
:- discontiguous s151_d/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
amount_("income",312).
start_("income","2015-01-01").
end_("income","2015-12-31").
father_("father").
agent_("father","Bob").
patient_("father","Alice").
s151_d("Alice",_,2000,2015).

% Test
:- s152_d_1_D("Bob",2015).
:- halt.
