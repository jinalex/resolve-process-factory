% Text
% In 2017, Alice was paid $33200. Alice was born March 2nd, 1950 and Bob was born March 3rd, 1955.

% Question
% Under section 63(f)(3), Alice's additional standard deduction in 2017 is equal to $600. Contradiction

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
birth_("Alice was born").
agent_("Alice was born","Alice").
start_("Alice was born","1950-03-02").
end_("Alice was born","1950-03-02").
birth_("Bob was born").
agent_("Bob was born","Bob").
start_("Bob was born","1955-03-03").
end_("Bob was born","1955-03-03").

% Test
:- \+ s63_f_3("Alice",2017,600).
:- halt.
