% Text
% Alice was paid $200 in 2017 for services performed in a hospital. Alice was committed to a psychiatric hospital from January 24, 2015 to May 5th, 2019.

% Question
% Section 3306(c)(21) applies to Alice's employment situation in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("services performed").
patient_("services performed","a hospital").
agent_("services performed","Alice").
start_("services performed","2017-01-01").
end_("services performed","2017-12-31").
payment_("paid").
agent_("paid","a hospital").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","services performed").
amount_("paid",200).
medical_institution_("a hospital").
agent_("a hospital","a hospital").
incarceration_("committed to a psychiatric hospital").
agent_("committed to a psychiatric hospital","Alice").
patient_("committed to a psychiatric hospital","a hospital").
start_("committed to a psychiatric hospital","2015-01-24").
end_("committed to a psychiatric hospital","2019-05-05").

% Test
:- \+ s3306_c_21("services performed","Alice",_,"2017-01-01").
:- halt.
