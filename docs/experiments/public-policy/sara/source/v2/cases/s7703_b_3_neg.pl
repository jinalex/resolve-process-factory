% Text
% Alice and Bob got married on April 5th, 2012. Alice and Bob have a son, Charlie, who was born on September 16th, 2017. Alice and Charlie live in a home maintained by Alice since September 16th, 2017. Alice is entitled to a deduction for Charlie under section 151(c) for the years 2017 to 2019. Bob lived in the same house as Alice and Charlie from September 16th, 2017 until October 10th, 2018.

% Question
% Section 7703(b)(3) applies to Alice maintaining her home for the year 2018. Contradiction

% Facts
:- discontiguous s151_c_applies/3.
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2012-04-05").
son_("son").
agent_("son","Charlie").
patient_("son","Bob").
patient_("son","Alice").
start_("son","2017-09-16").
residence_("live").
agent_("live","Alice").
agent_("live","Charlie").
patient_("live","home").
start_("live","2017-09-16").
alice_household_maintenance(Year,Event,Start_day,End_day) :-
    between(2017,2117,Year),
    atom_concat("maintained ",Year,Event),
    (((Year==2017)->(Start_day="2017-09-16"));first_day_year(Year,Start_day)),
    last_day_year(Year,End_day).
payment_(Event) :- alice_household_maintenance(_,Event,_,_).
agent_(Event,"Alice") :- alice_household_maintenance(_,Event,_,_).
amount_(Event,1) :- alice_household_maintenance(_,Event,_,_).
purpose_(Event,"home") :- alice_household_maintenance(_,Event,_,_).
start_(Event,Start_day) :- alice_household_maintenance(_,Event,Start_day,_).
end_(Event,End_day) :- alice_household_maintenance(_,Event,_,End_day).
s151_c_applies("Alice","Charlie",Year) :- between(2017,2019,Year).
residence_("lived").
agent_("lived","Bob").
patient_("lived","home").
start_("lived","2017-09-16").
end_("lived","2018-10-10").

% Test
:- \+ s7703_b_3("Alice",_,"home",2018).
:- halt.
