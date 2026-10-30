% Text
% Charlie is Bob's father since April 15th, 2014. Alice is Charlie's sister since October 12th, 1992.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(E). Contradiction

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Charlie").
patient_("father","Bob").
start_("father","2014-04-15").
sister_("sister").
agent_("sister","Alice").
patient_("sister","Charlie").
start_("sister","1992-10-12").

% Test
:- \+ s152_d_2_E("Alice","Bob",_,_,_).
:- halt.
