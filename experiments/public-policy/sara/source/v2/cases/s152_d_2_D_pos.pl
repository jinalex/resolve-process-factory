% Text
% Charlie is Bob's father since April 15th, 1995. Dorothy is Bob's mother. Alice married Charlie on August 8th, 2018.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(D) for the year 2019. Entailment

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Charlie").
patient_("father","Bob").
start_("father","1995-04-15").
mother_("mother").
agent_("mother","Dorothy").
patient_("mother","Bob").
start_("mother","1995-04-15").
marriage_("married").
agent_("married","Alice").
agent_("married","Charlie").
start_("married","2018-08-08").

% Test
:- s152_d_2_D("Alice","Bob",Start_relationship,End_relationship),
    var(End_relationship),
    first_day_year(2019,First_day),
    is_before(Start_relationship,First_day).
:- halt.
