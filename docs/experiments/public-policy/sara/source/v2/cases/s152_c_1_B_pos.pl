% Text
% Alice has a son, Bob. From September 1st, 2015 to November 3rd, 2019, Alice and Bob lived in the same home.

% Question
% Section 152(c)(1)(B) applies to Bob with Alice as the taxpayer for the year 2016. Entailment

% Facts
:- [statutes/prolog/init].
son_("son").
agent_("son","Bob").
patient_("son","Alice").
residence_("lived in the same home").
agent_("lived in the same home","Alice").
agent_("lived in the same home","Bob").
patient_("lived in the same home","home").
start_("lived in the same home","2015-09-01").
end_("lived in the same home","2019-11-03").

% Test
:- s152_c_1_B("Bob",_,"Alice",_,_,2016).
:- halt.
