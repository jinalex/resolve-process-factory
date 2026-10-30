% Text
% Alice has employed Bob from Jan 2nd, 2011 to Oct 10, 2019. On Oct 10, 2019 Bob was diagnosed as disabled and retired. Alice paid Bob $12980 because she had to terminate their contract due to Bob's disability, using the disability plan set up for all of Alice's employees.

% Question
% Section 3306(b)(10)(B) applies to the payment of $12980 that Alice made in 2019. Entailment

% Facts
:- [statutes/prolog/init].
service_("has employed").
patient_("has employed","Alice").
agent_("has employed","Bob").
start_("has employed","2011-01-02").
end_("has employed","2019-10-10").
disability_("was diagnosed as disabled").
agent_("was diagnosed as disabled","Bob").
start_("was diagnosed as disabled","2019-10-10").
termination_("terminate their contract").
agent_("terminate their contract","Alice").
patient_("terminate their contract","has employed").
reason_("terminate their contract","was diagnosed as disabled").
retirement_("retired").
agent_("retired","Bob").
start_("retired","2019-10-10").
reason_("retired","Bob's disability").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2019-10-10").
purpose_("paid","terminate their contract").
amount_("paid",12980).
means_("paid","disability plan").
plan_("disability plan").
agent_("disability plan","Alice").
purpose_("disability plan","make provisions for employees or dependents").

% Test
:- s3306_b_10_B(_,"paid",_).
:- halt.
