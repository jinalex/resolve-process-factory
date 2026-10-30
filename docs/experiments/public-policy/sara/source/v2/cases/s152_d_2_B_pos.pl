% Text
% Bob is Alice's brother since April 15th, 2014.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(B) for the year 2015. Entailment

% Facts
:- [statutes/prolog/init].
brother_("brother").
agent_("brother","Bob").
patient_("brother","Alice").
start_("brother","2014-04-15").

% Test
:- s152_d_2_B("Alice","Bob",_,_).
:- halt.
