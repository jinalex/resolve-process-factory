% Text
% In 2016, Alice's income was $567192. Alice is a surviving spouse for the year 2016.

% Question
% Under section 68(b)(1)(B), Alice's applicable amount for 2016 is equal to $275000. Contradiction

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",567192).
s2_a("Alice",_,2016).

% Test
:- \+ s68_b_1_B("Alice",275000,2016).
:- halt.
