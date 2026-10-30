% Text
% Alice and Bob got married on Jan 1st, 2015. Alice and Bob file separately in 2015.

% Question
% Section 152(b)(2) applies to Alice for the year 2015. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2015-01-01").

% Test
:- \+ s152_b_2("Alice",_,"Bob",2015).
:- halt.
