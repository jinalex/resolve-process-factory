% Text
% Alice has a son, Bob. From September 1st, 2015 to February 3rd, 2019, Alice and Bob lived in the same home. Bob married Charlie on October 23rd, 2018. Bob bears a relationship to Alice pursuant to section 152(c)(2) for the years 2015 to 2020.

% Question
% Under section 152(c)(1), Bob is a qualifying child of Alice for the year 2019. Contradiction

% Facts
:- discontiguous s152_c_2/4.
:- [statutes/prolog/init].
son_("has a son").
agent_("has a son","Bob").
patient_("has a son","Alice").
residence_("lived in the same home").
agent_("lived in the same home","Alice").
agent_("lived in the same home","Bob").
patient_("lived in the same home","home").
start_("lived in the same home","2015-09-01").
end_("lived in the same home","2019-02-03").
marriage_("married").
agent_("married","Bob").
agent_("married","Charlie").
start_("married","2018-10-23").
s152_c_2("Bob","Alice","2015-01-01","2020-12-31").

% Test
:- \+ s152_c_1("Bob","Alice",2019).
:- halt.
