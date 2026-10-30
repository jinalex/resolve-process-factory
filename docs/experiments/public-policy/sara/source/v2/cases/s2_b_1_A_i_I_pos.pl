% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice and Bob have a child, Charlie, born October 9th, 2000. Alice died on July 9th, 2014. From 2004 to 2019, Bob furnished the costs of maintaining the home where he and Charlie lived during that time. Charlie married Dan on Feb 14th, 2017.

% Question
% Section 2(b)(1)(A)(i)(I) applies to Charlie in 2017. Entailment

% Facts
:- [statutes/prolog/init].
marriage_("Alice and Bob got married").
agent_("Alice and Bob got married","Alice").
agent_("Alice and Bob got married","Bob").
start_("Alice and Bob got married","1992-02-03").
death_("died").
agent_("died","Alice").
start_("died","2014-07-09").
end_("died","2014-07-09").
son_("have a child").
agent_("have a child","Charlie").
patient_("have a child","Alice").
patient_("have a child","Bob").
start_("have a child","2000-10-09").
residence_("lived").
agent_("lived","Charlie").
agent_("lived","Bob").
patient_("lived","the home").
start_("lived","2004-01-01").
end_("lived","2019-12-31").
bob_household_maintenance(Year,Event,Start_day,End_day) :-
    between(2004,2019,Year),
    atom_concat("furnished the costs of maintaining the home ",Year,Event),
    first_day_year(Year,Start_day),
    last_day_year(Year,End_day).
payment_(Event) :- bob_household_maintenance(_,Event,_,_).
agent_(Event,"Bob") :- bob_household_maintenance(_,Event,_,_).
amount_(Event,1) :- bob_household_maintenance(_,Event,_,_).
purpose_(Event,"the home") :- bob_household_maintenance(_,Event,_,_).
start_(Event,Start_day) :- bob_household_maintenance(_,Event,Start_day,_).
end_(Event,End_day) :- bob_household_maintenance(_,Event,_,End_day).
marriage_("Charlie married Dan").
agent_("Charlie married Dan","Dan").
agent_("Charlie married Dan","Charlie").
start_("Charlie married Dan","2017-02-14").

% Test
:- s2_b_1_A_i_I("Charlie",2017).
:- halt.
