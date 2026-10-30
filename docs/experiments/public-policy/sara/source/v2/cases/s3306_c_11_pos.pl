% Text
% Alice was paid $73200 in 2017 as an employee of the Canadian Government, in Toronto, Ontario, Canada.

% Question
% Section 3306(c)(11) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("an employee").
patient_("an employee","Canadian Government").
agent_("an employee","Alice").
start_("an employee","2017-01-01").
end_("an employee","2017-12-31").
location_("an employee","Toronto").
location_("an employee","Ontario").
location_("an employee","Canada").
payment_("was paid").
agent_("was paid","Canadian Government").
patient_("was paid","Alice").
start_("was paid","2017-12-31").
purpose_("was paid","an employee").
amount_("was paid",73200).

% Test
:- s3306_c_11("an employee",_).
:- halt.
