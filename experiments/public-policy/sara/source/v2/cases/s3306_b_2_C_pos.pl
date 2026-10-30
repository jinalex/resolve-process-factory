% Text
% Alice has paid $45252 to Bob for work done in the year 2017. In 2017, Alice has also paid $9832 into a retirement fund for Bob, and $5322 into life insurance for Bob.

% Question
% Section 3306(b)(2)(C) applies to the payment Alice made to the life insurance fund for the year 2017. Entailment

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
plan_("retirement fund").
purpose_("retirement fund","make provisions for employees in case of retirement").
beneficiary_("retirement fund","Bob").
start_("$9832 into a retirement fund","2017-01-01").
end_("$9832 into a retirement fund","2017-12-31").
amount_("$9832 into a retirement fund",9832).
payment_("$5322 into life insurance").
agent_("$5322 into life insurance","Alice").
patient_("$5322 into life insurance","life insurance").
plan_("life insurance").
purpose_("life insurance","make provisions for employees in case of death").
beneficiary_("life insurance","Bob").
start_("$5322 into life insurance","2017-01-01").
end_("$5322 into life insurance","2017-12-31").
amount_("$5322 into life insurance",5322).

% Test
:- s3306_b_2_C("life insurance").
:- halt.
