% Text
% Alice has paid $3200 to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017, in Stanley, Wisconsin, USA. Alice is an American citizen, and Bob is a Mexican citizen who was admitted to the USA to perform agricultural labor pursuant to sections 214(c) and 101(a)(15)(H) of the Immigration and Nationality Act.

% Question
% Section 3306(c)(1)(B) applies to Alice employing Bob for the year 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
location_("agricultural labor","Stanley, Wisconsin, USA").
country_("Stanley, Wisconsin, USA","USA").
purpose_("agricultural labor","agricultural labor").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","agricultural labor").
amount_("paid",3200).
citizenship_("American citizen").
agent_("American citizen","Alice").
patient_("American citizen","USA").
citizenship_("Mexican citizen").
agent_("Mexican citizen","Bob").
patient_("Mexican citizen","Mexico").
migration_("admitted to the USA").
destination_("admitted to the USA","USA").
agent_("admitted to the USA","Bob").
purpose_("admitted to the USA","agricultural labor").

% Test
:- \+ s3306_c_1_B("agricultural labor",_).
:- halt.
