% Text
% Charlie is Bob's father since April 15th, 2014. Alice married Charlie on October 12th, 1992.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(F). Contradiction

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Charlie").
patient_("father","Bob").
start_("father","2014-04-15").
marriage_("married").
agent_("married","Alice").
agent_("married","Charlie").
start_("married","1992-10-12").

% Test
:- \+ s152_d_2_F("Alice","Bob",_,_,_).
:- halt.
