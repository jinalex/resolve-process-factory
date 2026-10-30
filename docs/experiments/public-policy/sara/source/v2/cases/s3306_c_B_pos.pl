% Text
% Alice has paid $3200 to Bob for work done from Feb 1st, 2017 to Sep 2nd, 2017, in Caracas, Venezuela. Bob is an American citizen and Alice is an American employer.

% Question
% Section 3306(c)(B) applies to Alice employing Bob for the year 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("work").
patient_("work","Alice").
agent_("work","Bob").
start_("work","2017-02-01").
end_("work","2017-09-02").
location_("work","Caracas, Venezuela").
country_("Caracas, Venezuela","Venezuela").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","work").
amount_("paid",3200).
american_employer_("an American employer").
agent_("an American employer","Alice").
citizenship_("an American citizen").
agent_("an American citizen","Bob").
patient_("an American citizen","USA").

% Test
:- s3306_c_B("work",_,_,_).
:- halt.
