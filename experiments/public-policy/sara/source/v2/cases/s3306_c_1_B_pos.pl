% Text
% Alice has paid $3200 to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017, in Caracas, Venezuela. Bob is an American citizen. Alice is an American employer.

% Question
% Section 3306(c)(1)(B) applies to Alice employing Bob for the year 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
location_("agricultural labor","Caracas, Venezuela").
country_("Caracas, Venezuela","Venezuela").
purpose_("agricultural labor","agricultural labor").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","agricultural labor").
amount_("paid",3200).
american_employer_("American employer").
agent_("American employer","Alice").
citizenship_("American citizen").
agent_("American citizen","Bob").
patient_("American citizen","USA").

% Test
:- s3306_c_1_B("agricultural labor",_).
:- halt.
