% Text
% Alice and Bob got married on Feb 3rd, 1992. Bob has a brother, Charlie, born October 9th, 2000. Alice died on July 9th, 2014. From 2004 to 2019, Bob furnished the costs of maintaining the home where he and Charlie lived during that time. In 2017, Charlie earned $312489. In 2017, Charlie filed a joint return with his spouse whom he married on Dec 1st, 2016.

% Question
% Section 2(b)(1)(A)(ii) applies to Charlie as the dependent in 2017. Contradiction

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
son_("has a brother").
agent_("has a brother","Charlie").
patient_("has a brother","Bob").
start_("has a brother","2000-10-09").
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
income_("earned").
agent_("earned","Charlie").
amount_("earned",312489).
start_("earned","2017-12-31").
marriage_("whom he married").
agent_("whom he married","Charlie").
agent_("whom he married","his spouse").
start_("whom he married","2016-12-01").
joint_return_("filed a joint return").
agent_("filed a joint return","Charlie").
agent_("filed a joint return","his spouse").
start_("filed a joint return","2017-01-01").
end_("filed a joint return","2017-12-31").

% Test
:- \+ s2_b_1_A_ii(_,"Charlie",2017).
:- halt.
