% Text
% Alice was paid $73200 in 2017 as an employee of Nando's Chicken in Arlington, Virginia, USA.

% Question
% Section 3306(c)(6) applies to Alice's employment situation in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("an employee").
patient_("an employee","Nando's Chicken").
agent_("an employee","Alice").
start_("an employee","2017-01-01").
end_("an employee","2017-12-31").
location_("an employee","Arlington").
location_("an employee","Virginia").
location_("an employee","USA").
payment_("paid").
agent_("paid","Nando's Chicken").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","an employee").
amount_("paid",73200).

% Test
:- \+ s3306_c_6("an employee").
:- halt.
