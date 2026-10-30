% Text
% Alice's income in 2015 is $395276. The applicable amount according to section 68(b) is $250000.
%
% Question
% Under section 151(d)(3)(B), the applicable percentage for Alice for 2015 is equal to 118. Contradiction

% Facts
:- discontiguous s68_b/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
amount_("income",395276).
start_("income","2015-01-01").
end_("income","2015-12-31").
s68_b("Alice",2015,250000).

% Test
:- \+ s151_d_3_B(118,"Alice",_,2015,_).
:- halt.
