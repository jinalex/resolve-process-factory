% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice and Bob were legally separated under a decree of separate maintenance on July 9th, 2014.

% Question
% Section 2(b)(2)(A) applies to Alice and Bob in 2010. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","1992-02-03").
legal_separation_("were legally separated").
agent_("were legally separated","decree of separate maintenance").
patient_("were legally separated","married").
start_("were legally separated","2014-07-09").

% Test
:- \+ s2_b_2_A("Alice","Bob",_,_,2010).
:- halt.
