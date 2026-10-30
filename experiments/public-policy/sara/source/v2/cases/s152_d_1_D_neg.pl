% Text
% In 2015, Alice's income was $312. The exemption amount for Alice under section 151(d) for the year 2015 was $2000. Alice is Bob's mother, and Bob is a dependent of Alice under 152(c) for the year 2015.

% Question
% Section 152(d)(1)(D) applies to Bob for the year 2015. Contradiction

% Facts
:- discontiguous s152_c/3.
:- discontiguous s151_d/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
amount_("income",312).
start_("income","2015-01-01").
end_("income","2015-12-31").
mother_("mother").
agent_("mother","Alice").
patient_("mother","Bob").
s152_c("Bob","Alice",2015).
s151_d("Alice",_,2000,2015).

% Test
:- \+ s152_d_1_D("Bob",2015).
:- halt.
