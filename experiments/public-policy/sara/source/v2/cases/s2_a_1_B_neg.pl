% Text
% Alice and Bob were married from Feb 3rd, 1992 to Jan 14th, 2020. Alice has a child, Charlie, born October 9th, 2000. Alice died on July 9th, 2021. From 2011 to 2024, Bob furnished the costs of maintaining the home where he and Charlie lived during that time. In 2020, Charlie filed a joint return with his spouse whom he married on Dec 1st, 2020. Charlie earned $312489 in 2020.

% Question
% Section 2(a)(1)(B) applies to Bob in 2020. Contradiction

% Facts
:- [statutes/prolog/init].
marriage_("got married").
agent_("got married","Alice").
agent_("got married","Bob").
start_("got married","1992-02-03").
end_("got married","2020-01-14").
death_("died").
agent_("died","Alice").
start_("died","2021-07-09").
son_("has a child").
agent_("has a child","Charlie").
patient_("has a child","Alice").
start_("has a child","2000-10-09").
residence_("lived").
agent_("lived","Charlie").
agent_("lived","Bob").
patient_("lived","the home").
start_("lived","2011-01-01").
end_("lived","2024-12-31").
bob_household_maintenance(Year,Event,Start_day,End_day) :-
    between(2011,2024,Year),
    atom_concat("furnished the costs of maintaining the home ",Year,Event),
    first_day_year(Year,Start_day),
    last_day_year(Year,End_day).
payment_(Event) :- bob_household_maintenance(_,Event,_,_).
agent_(Event,"Bob") :- bob_household_maintenance(_,Event,_,_).
amount_(Event,1) :- bob_household_maintenance(_,Event,_,_).
purpose_(Event,"the home") :- bob_household_maintenance(_,Event,_,_).
start_(Event,Start_day) :- bob_household_maintenance(_,Event,Start_day,_).
end_(Event,End_day) :- bob_household_maintenance(_,Event,_,End_day).
marriage_("whom he married").
agent_("whom he married","Charlie").
agent_("whom he married","his spouse").
start_("whom he married","2020-12-01").
joint_return_("filed a joint return").
agent_("filed a joint return","Charlie").
agent_("filed a joint return","his spouse").
start_("filed a joint return","2020-01-01").
end_("filed a joint return","2020-12-31").
income_("earned").
agent_("earned","Charlie").
amount_("earned",312489).
start_("earned","2020-12-31").

% Test
:- \+ s2_a_1_B("Bob",_,_,2020).
:- halt.
