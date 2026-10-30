% Text
% Alice and Bob got married on April 5th, 2012. Alice and Bob were legally separated under a decree of divorce on September 16th, 2017.

% Question
% Section 7703(a)(2) applies to Alice for the year 2018. Entailment

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2012-04-05").
legal_separation_("legally separated").
patient_("legally separated","married").
agent_("legally separated","decree of divorce").
start_("legally separated","2017-09-16").

% Test
:- s7703_a_2("Alice",_,_,_,2018).
:- halt.
