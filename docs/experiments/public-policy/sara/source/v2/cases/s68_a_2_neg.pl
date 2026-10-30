% Text
% In 2016, Alice's income was $295192. Alice is a surviving spouse for the year 2016. Alice is allowed itemized deductions of $60000 under section 63.

% Question
% Section 68(a)(2) prescribes a reduction of Alice's itemized deductions for the year 2016 by $47000. Contradiction

% Facts
:- discontiguous s2_a/3.
:- discontiguous s63_d/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",295192).
s63_d("Alice",_,60000,2016).
s2_a("Alice",_,2016).

% Test
:- \+ s68_a_2("Alice",_,47000,2016).
:- halt.
