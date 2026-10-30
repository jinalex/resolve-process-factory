% Text
% Alice has paid $3200 to Bob for work done from Feb 1st, 2017 to Sep 2nd, 2017, in Baltimore, Maryland, USA.

% Question
% Section 3306(c)(A) applies to Alice employing Bob for the year 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("work").
patient_("work","Alice").
agent_("work","Bob").
start_("work","2017-02-01").
end_("work","2017-09-02").
location_("work","Baltimore, Maryland, USA").
country_("Baltimore, Maryland, USA","USA").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","work").
amount_("paid",3200).

% Test
:- s3306_c_A("work",_,_).
:- halt.
