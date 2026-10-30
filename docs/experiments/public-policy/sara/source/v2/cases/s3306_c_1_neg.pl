% Text
% Alice has paid $3200 to Bob for domestic service done from Feb 1st, 2017 to Sep 2nd, 2017, in Caracas, Venezuela. Alice is an American employer.

% Question
% Section 3306(c)(1) applies to Alice employing Bob for the year 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("domestic service").
patient_("domestic service","Alice").
agent_("domestic service","Bob").
start_("domestic service","2017-02-01").
end_("domestic service","2017-09-02").
location_("domestic service","Caracas, Venezuela").
country_("Caracas, Venezuela", "Venezuela").
purpose_("domestic service","domestic service").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","domestic service").
amount_("paid",3200).
american_employer_("American employer").
agent_("American employer","Alice").

% Test
:- \+ s3306_c_1("domestic service",2017).
:- halt.
