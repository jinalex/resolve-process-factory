% Text
% Alice has employed Bob from Jan 2nd, 2011 to Oct 10, 2019. On Oct 10, 2019 Bob retired because he reached age 65. Alice paid Bob $12980 as a retirement bonus.

% Question
% Section 3306(b)(10)(A) applies to the payment of $12980 that Alice made in 2019. Contradiction

% Facts
:- [statutes/prolog/init].
service_("has employed").
patient_("has employed","Alice").
agent_("has employed","Bob").
start_("has employed","2011-01-02").
end_("has employed","2019-10-10").
termination_("retirement").
agent_("retirement","Alice").
patient_("retirement","has employed").
retirement_("retired").
agent_("retired","Bob").
start_("retired","2019-10-10").
reason_("retired","reached age 65").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2019-10-10").
purpose_("paid","retirement").
amount_("paid",12980).

% Test
:- \+ s3306_b_10_A("paid","has employed","Bob","Alice",_,_).
:- halt.
