% Text
% In 2016, Alice's income was $567192. Alice is not married.

% Question
% Section 68(b)(1)(D) applies to Alice in 2016. Contradiction

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",567192).
s2_a("Alice",_,2016).

% Test
:- \+ s68_b_1_D("Alice",150000,2016).
:- halt.
