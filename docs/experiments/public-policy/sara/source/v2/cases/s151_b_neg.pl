% Text
% Alice and Bob have been married since 2 Feb 2015. Bob has no income for 2015. Alice and Bob file their taxes jointly for 2015.

% Question
% Alice can receive an exemption for Bob under section 151(b) for the year 2015. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2015-02-02").
joint_return_("jointly").
agent_("jointly","Alice").
agent_("jointly","Bob").
start_("jointly","2015-01-01").
end_("jointly","2015-12-31").

% Test
:- \+ s151_b("Alice","Bob",2015).
:- halt.
