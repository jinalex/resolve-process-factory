% Text
% Alice and Bob got married on Feb 3rd, 1992. Alice died on July 9th, 2014. From 2015 to 2019, Bob furnished the costs of maintaining the home where he and his friend Charlie lived during that time. Charlie is a dependent of Bob under section 152(d)(2)(H) for the years 2015 to 2019. Bob earned $300000 every year from 2015 to 2019.

% Question
% Section 2(b)(3)(B) applies to Bob as the taxpayer and Charlie as the individual in 2018. Entailment

% Facts
:- discontiguous s152_d_2_H/6.
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","1992-02-03").
death_("died").
agent_("died","Alice").
start_("died","2014-07-09").
end_("died","2014-07-09").
residence_("lived").
agent_("lived","Charlie").
agent_("lived","Bob").
patient_("lived","the home").
start_("lived","2015-01-01").
end_("lived","2019-12-31").
bob_household_maintenance(Year,Event,Start_day,End_day) :-
    between(2015,2019,Year),
    atom_concat("furnished the costs of maintaining the home ",Year,Event),
    first_day_year(Year,Start_day),
    last_day_year(Year,End_day).
payment_(Event) :- bob_household_maintenance(_,Event,_,_).
agent_(Event,"Bob") :- bob_household_maintenance(_,Event,_,_).
amount_(Event,1) :- bob_household_maintenance(_,Event,_,_).
purpose_(Event,"the home") :- bob_household_maintenance(_,Event,_,_).
start_(Event,Start_day) :- bob_household_maintenance(_,Event,Start_day,_).
end_(Event,End_day) :- bob_household_maintenance(_,Event,_,End_day).
s152_d_2_H("Charlie","Bob",Year,_,Start_day,End_day) :-
    between(2015,2019,Year),first_day_year(Year,Start_day),last_day_year(Year,End_day).
bob_income(Year,Event,Start_day,End_day) :-
    between(2015,2019,Year),
    atom_concat("earned ",Year,Event),
    first_day_year(Year,Start_day),
    last_day_year(Year,End_day).
income_(Event) :- bob_household_maintenance(_,Event,_,_).
agent_(Event,"Bob") :- bob_household_maintenance(_,Event,_,_).
amount_(Event,300000) :- bob_household_maintenance(_,Event,_,_).
start_(Event,Start_day) :- bob_household_maintenance(_,Event,Start_day,_).
end_(Event,End_day) :- bob_household_maintenance(_,Event,_,End_day).

% Test
:- s2_b_3_B("Bob","Charlie",2018).
:- halt.
