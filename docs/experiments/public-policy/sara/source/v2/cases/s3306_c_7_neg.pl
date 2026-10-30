% Text
% Alice was paid $73200 in 2017 as an employee of Bertha's Mussels in Baltimore, Maryland, USA.

% Question
% Section 3306(c)(7) applies to Alice's employment situation in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("an employee").
patient_("an employee","Bertha's Mussels").
agent_("an employee","Alice").
start_("an employee","2017-01-01").
end_("an employee","2017-12-31").
location_("an employee","Baltimore").
location_("an employee","Maryland").
location_("an employee","USA").
payment_("paid").
agent_("paid","Bertha's Mussels").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","an employee").
amount_("paid",73200).

% Test
:- \+ s3306_c_7("an employee",_).
:- halt.
