% Text
% In 2016, Alice's income was $567192. Alice is a head of household for the year 2016.

% Question
% Section 68(b)(1)(C) applies to Alice in 2016. Contradiction

% Facts
:- discontiguous s2_b/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",567192).
s2_b("Alice",_,2016).

% Test
:- \+ s68_b_1_C("Alice",_,2016).
:- halt.
