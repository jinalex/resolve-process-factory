% Text
% In 2016, Alice's income was $277192. Alice is a head of household for the year 2016. Alice is allowed itemized deductions of $60000 under section 63.

% Question
% Section 68(a)(2) prescribes a reduction of Alice's itemized deductions for the year 2016 by $48000. Entailment

% Facts
:- discontiguous s2_b/3.
:- discontiguous s63_d/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",277192).
s63_d("Alice",_,60000,2016).
s2_b("Alice",_,2016).

% Test
:- s68_a_2("Alice",_,48000,2016).
:- halt.
