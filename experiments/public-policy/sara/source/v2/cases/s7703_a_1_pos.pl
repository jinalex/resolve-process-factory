% Text
% Alice and Bob got married on April 5th, 2012. Bob died September 16th, 2017.

% Question
% Section 7703(a)(1) applies to Alice for the year 2012. Entailment

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2012-04-05").
death_("died").
agent_("died","Bob").
start_("died","2017-09-16").

% Test
:- s7703_a_1("Alice",_,_,_,2012).
:- halt.
