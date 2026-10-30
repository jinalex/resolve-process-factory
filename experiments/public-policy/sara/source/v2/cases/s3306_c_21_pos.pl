% Text
% Alice was paid $200 in 2017 for services performed in jail. Alice was committed to jail from January 24, 2015 to May 5th, 2019.

% Question
% Section 3306(c)(21) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("services performed").
patient_("services performed","jail").
agent_("services performed","Alice").
start_("services performed","2017-01-01").
end_("services performed","2017-12-31").
payment_("paid").
agent_("paid","jail").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","services performed").
amount_("paid",200).
penal_institution_("jail").
agent_("jail","jail").
incarceration_("committed to jail").
agent_("committed to jail","Alice").
patient_("committed to jail","jail").
start_("committed to jail","2015-01-24").
end_("committed to jail","2019-05-05").

% Test
:- s3306_c_21("services performed","Alice",_,"2017-01-01").
:- halt.
