% Text
% Alice has a son, Bob, who was born January 31st, 2014.

% Question
% Alice bears a relationship to Bob under section 152(c)(2). Contradiction

% Facts
:- [statutes/prolog/init].
son_("has a son").
agent_("has a son","Bob").
patient_("has a son","Alice").
start_("has a son","2014-01-31").

% Test
:- \+ s152_c_2("Alice","Bob",_,_).
:- halt.
