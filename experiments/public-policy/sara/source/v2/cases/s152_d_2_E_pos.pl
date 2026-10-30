% Text
% Charlie is Alice's father since April 15th, 2014. Bob is Charlie's brother since October 12th, 1992.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(E). Entailment

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Charlie").
patient_("father","Alice").
start_("father","2014-04-15").
brother_("brother").
agent_("brother","Bob").
patient_("brother","Charlie").
start_("brother","1992-10-12").

% Test
:- s152_d_2_E("Alice","Bob",_,_,_).
:- halt.
