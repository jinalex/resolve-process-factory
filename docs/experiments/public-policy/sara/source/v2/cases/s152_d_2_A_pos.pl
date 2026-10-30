% Text
% Bob is Alice's father since April 15th, 2014.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(A). Entailment

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Bob").
patient_("father","Alice").
start_("father","2014-04-15").

% Test
:- s152_d_2_A("Alice","Bob",_,_).
:- halt.
