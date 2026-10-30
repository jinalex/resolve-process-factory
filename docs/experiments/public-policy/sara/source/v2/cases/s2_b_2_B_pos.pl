% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice was a nonresident alien until July 9th, 2014.

% Question
% Section 2(b)(2)(B) applies to Bob in 2013. Entailment

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","1992-02-03").
nonresident_alien_("was a nonresident alien").
agent_("was a nonresident alien","Alice").
end_("was a nonresident alien","2014-07-09").

% Test
:- s2_b_2_B("Bob",_,2013).
:- halt.
