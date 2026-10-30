% Text
% Alice and Bob have been married since 2 Feb 2015. Charlie counts as Alice's dependent under section 152(c)(1) for 2015.

% Question
% Alice can claim an exemption with Bob as the dependent for 2015 under section 151(c). Contradiction

% Facts
:- discontiguous s152_c_1/3.
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2015-02-02").
s152_c_1("Charlie","Alice",2015).

% Test
:- \+ s151_c("Alice","Bob",_,2015).
:- halt.
