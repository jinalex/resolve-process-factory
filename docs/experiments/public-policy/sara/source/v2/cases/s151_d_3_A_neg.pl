% Text
% Alice's income in 2015 was $260932. For 2015, Alice received one exemption of $2000 under section 151(c). Alice's applicable percentage under section 151(d)(3)(B) is equal to 10%.

% Question
% Under section 151(d)(3)(A), Alice's exemption amount is reduced to $1900. Contradiction

% Facts
:- discontiguous s151_c/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
amount_("income",260932).
start_("income","2015-01-01").
end_("income","2015-12-31").
s151_c("Alice",_,2000,2015).

% Test
:- \+ s151_d_3_A("Alice",_,_,_,2000,1900,2015).
:- halt.
