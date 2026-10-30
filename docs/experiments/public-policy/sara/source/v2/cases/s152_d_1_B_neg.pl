% Text
% In 2015, Alice's income was $2312. The exemption amount for Alice under section 151(d) for the year 2015 was $2000.

% Question
% Section 152(d)(1)(B) applies to Alice for the year 2015. Contradiction

% Facts
:- discontiguous s151_d/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
amount_("income",2312).
start_("income","2015-01-01").
end_("income","2015-12-31").
s151_d("Alice",_,2000,2015).

% Test
:- \+ s152_d_1_B("Alice",2015).
:- halt.
