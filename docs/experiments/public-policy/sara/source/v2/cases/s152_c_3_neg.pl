% Text
% Alice was born January 10th, 1992. Bob was born January 31st, 1984. Alice adopted Bob on March 4th, 2018.

% Question
% Bob satisfies section 152(c)(3) with Alice claiming Bob as a qualifying child for the year 2019. Contradiction

% Facts
:- [statutes/prolog/init].
birth_("Alice was born").
agent_("Alice was born","Alice").
start_("Alice was born","1992-01-10").
end_("Alice was born","1992-01-10").
birth_("Bob was born").
agent_("Bob was born","Bob").
start_("Bob was born","1984-01-31").
end_("Bob was born","1984-01-31").
son_("adopted").
agent_("adopted","Bob").
patient_("adopted","Alice").
start_("adopted","2018-03-04").

% Test
:- \+ s152_c_3("Bob","Alice",2019).
:- halt.
