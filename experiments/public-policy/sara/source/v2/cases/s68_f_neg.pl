% Text
% In 2014, Alice's income was $310192. Alice is a surviving spouse for the year 2014. Alice is allowed itemized deductions of $600 under section 63.

% Question
% Section 68(f) applies to Alice for the year 2014. Contradiction

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2014-12-31").
amount_("income",310192).
s2_a("Alice",_,2014).

% Test
:- \+ s68_f(2014).
:- halt.
