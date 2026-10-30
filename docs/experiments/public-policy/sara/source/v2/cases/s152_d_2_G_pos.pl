% Text
% Charlie is Bob's father since April 15th, 2014. Alice married Bob on October 12th, 1992.

% Question
% Alice bears a relationship to Charlie under section 152(d)(2)(G) for the year 2018. Entailment

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Charlie").
patient_("father","Bob").
start_("father","2014-04-15").
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","1992-10-12").

% Test
:- s152_d_2_G("Alice","Charlie",Start_relationship,End_relationship),
    var(End_relationship),
    first_day_year(2018,First_day),
    is_before(Start_relationship,First_day).
:- halt.
