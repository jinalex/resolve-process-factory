% Text
% Alice was paid $73200 in 2017 as an employee of the State of Maryland in Baltimore, Maryland, USA.

% Question
% Section 3306(c)(7) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("an employee").
patient_("an employee","State of Maryland").
agent_("an employee","Alice").
start_("an employee","2017-01-01").
end_("an employee","2017-12-31").
location_("an employee","Baltimore").
location_("an employee","Maryland").
location_("an employee","USA").
payment_("was paid").
agent_("was paid","State of Maryland").
patient_("was paid","Alice").
start_("was paid","2017-12-31").
purpose_("was paid","an employee").
amount_("was paid",73200).

% Test
:- s3306_c_7("an employee",_).
:- halt.
