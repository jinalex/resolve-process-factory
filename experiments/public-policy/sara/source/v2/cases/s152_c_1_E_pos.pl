% Text
% Alice has a son, Bob. From September 1st, 2015 to November 3rd, 2019, Alice and Bob lived in the same home. Bob married Charlie on October 23rd, 2018. Bob and Charlie file separate returns.

% Question
% Section 152(c)(1)(E) applies to Bob for the year 2019. Entailment

% Facts
:- [statutes/prolog/init].
son_("has a son").
agent_("has a son","Bob").
patient_("has a son","Alice").
residence_("lived in the same home").
agent_("lived in the same home","Alice").
agent_("lived in the same home","Bob").
patient_("lived in the same home","home").
start_("lived in the same home","2015-09-01").
end_("lived in the same home","2019-11-03").
marriage_("married").
agent_("married","Bob").
agent_("married","Charlie").
start_("married","2018-10-23").

% Test
:- s152_c_1_E("Bob",_,2019).
:- halt.
