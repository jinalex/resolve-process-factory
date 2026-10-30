% Text
% Alice has a son, Bob, who was born January 31st, 2014.

% Question
% Bob bears a relationship to Alice under section 152(c)(2). Entailment

% Facts
:- [statutes/prolog/init].
son_("has a son").
agent_("has a son","Bob").
patient_("has a son","Alice").
start_("has a son","2014-01-31").

% Test
:- s152_c_2("Bob","Alice",_,_).
:- halt.
