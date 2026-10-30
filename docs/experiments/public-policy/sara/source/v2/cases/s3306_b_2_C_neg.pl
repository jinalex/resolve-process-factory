% Text
% Alice has paid $45252 to Bob for work done in the year 2017. In 2017, Alice has also paid $9832 into a retirement fund for Bob, and $5322 into life insurance for Charlie, who is Alice's father and has retired in 2016.

% Question
% Section 3306(b)(2)(C) applies to the payment Alice made to the retirement fund for the year 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("work").
patient_("work","Alice").
agent_("work","Bob").
start_("work","2017-01-01").
end_("work","2017-12-31").
payment_("Alice has paid $45252 to Bob").
agent_("Alice has paid $45252 to Bob","Alice").
patient_("Alice has paid $45252 to Bob","Bob").
start_("Alice has paid $45252 to Bob","2017-01-01").
end_("Alice has paid $45252 to Bob","2017-12-31").
purpose_("Alice has paid $45252 to Bob","work").
amount_("Alice has paid $45252 to Bob",45252).
payment_("$9832 into a retirement fund").
agent_("$9832 into a retirement fund","Alice").
patient_("$9832 into a retirement fund","retirement fund").
purpose_("$9832 into a retirement fund","make provisions for employees in case of retirement").
beneficiary_("$9832 into a retirement fund","Bob").
start_("$9832 into a retirement fund","2017-01-01").
end_("$9832 into a retirement fund","2017-12-31").
amount_("$9832 into a retirement fund",9832).
payment_("$5322 into life insurance").
agent_("$5322 into life insurance","Alice").
patient_("$5322 into life insurance","life insurance").
purpose_("$5322 into life insurance","make provisions for employees in case of death").
beneficiary_("$5322 into life insurance","Charlie").
start_("$5322 into life insurance","2017-01-01").
end_("$5322 into life insurance","2017-12-31").
amount_("$5322 into life insurance",5322).
father_("father").
agent_("father","Charlie").
patient_("father","Alice").
retirement_("retired").
agent_("retired","Charlie").
start_("retired","2016-01-01").

% Test
:- \+ s3306_b_2_C("retirement fund").
:- halt.
