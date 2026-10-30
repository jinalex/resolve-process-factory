% Text
% Bob is Alice's son since April 15th, 2014.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(C). Entailment

% Facts
:- [statutes/prolog/init].
son_("son").
agent_("son","Bob").
patient_("son","Alice").
start_("son","2014-04-15").

% Test
:- s152_d_2_C("Alice","Bob",_,_).
:- halt.
