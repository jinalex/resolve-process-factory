% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice died on July 9th, 2014. Alice was a nonresident alien since March 4th, 1990.

% Question
% Section 2(a)(2)(B) applies to Bob in 2014. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","1992-02-03").
death_("died").
agent_("died","Alice").
start_("died","2014-07-09").
end_("died","2014-07-09").
nonresident_alien_("was a nonresident alien").
agent_("was a nonresident alien","Alice").
start_("was a nonresident alien","1990-03-04").

% Test
:- \+ s2_a_2_B("Bob",_,2014).
:- halt.
