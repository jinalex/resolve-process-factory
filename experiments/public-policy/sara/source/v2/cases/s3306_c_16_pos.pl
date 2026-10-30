% Text
% Alice was paid $73200 in 2017 as an employee of the International Monetary Fund in Washington, D.C., USA.

% Question
% Section 3306(c)(16) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
international_organization_("International Monetary Fund").
agent_("International Monetary Fund","International Monetary Fund").
service_("an employee").
patient_("an employee","International Monetary Fund").
agent_("an employee","Alice").
start_("an employee","2017-01-01").
end_("an employee","2017-12-31").
location_("an employee","Washington, D.C.").
location_("an employee","USA").
payment_("paid").
agent_("paid","International Monetary Fund").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","an employee").
amount_("paid",73200).

% Test
:- s3306_c_16("an employee",_).
:- halt.
