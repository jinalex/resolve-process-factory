% Text
% Alice has a brother, Bob, who was born January 31st, 2014.

% Question
% Bob bears a relationship to Alice under section 152(c)(2)(B). Entailment

% Facts
:- [statutes/prolog/init].
brother_("has a brother").
agent_("has a brother","Bob").
patient_("has a brother","Alice").
start_("has a brother","2014-01-31").

% Test
:- s152_c_2_B("Bob","Alice",_,_,_).
:- halt.
