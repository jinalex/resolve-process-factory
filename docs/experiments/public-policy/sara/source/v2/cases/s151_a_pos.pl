% Text
% Alice's income in 2015 is $100000. She gets one exemption of $2000 for the year 2015 under section 151(c). Alice is not married.

% Question
% Alice's total exemption for 2015 under section 151(a) is equal to $4000. Entailment

% Facts
:- discontiguous s151_c/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2015-01-01").
end_("income","2015-12-31").
amount_("income",100000).
s151_c("Alice",_,2000,2015).

% Test
:- s151_a("Alice",4000,2015).
:- halt.
