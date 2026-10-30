% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice died on July 9th, 2014. Bob married Charlie on September 14th, 2015.

% Question
% Section 2(a)(2)(A) applies to Bob in 2014. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("got married").
agent_("got married","Alice").
agent_("got married","Bob").
start_("got married","1992-02-03").
death_("died").
agent_("died","Alice").
start_("died","2014-07-09").
end_("died","2014-07-09").
marriage_("Bob married Charlie").
agent_("Bob married Charlie","Charlie").
agent_("Bob married Charlie","Bob").
start_("Bob married Charlie","2015-09-14").

% Test
:- \+ s2_a_2_A("Bob",_,_,_,2014).
:- halt.
