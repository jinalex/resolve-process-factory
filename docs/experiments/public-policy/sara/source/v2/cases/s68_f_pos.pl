% Text
% In 2018, Alice's income was $310192. Alice is a surviving spouse for the year 2018. Alice is allowed itemized deductions of $600 under section 63.

% Question
% Section 68(f) applies to Alice for the year 2018. Entailment

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2018-12-31").
amount_("income",310192).
s2_a("Alice",_,2018).

% Test
:- s68_f(2018).
:- halt.
