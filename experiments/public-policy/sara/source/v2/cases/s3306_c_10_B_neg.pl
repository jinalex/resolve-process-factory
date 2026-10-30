% Text
% Alice was paid $200 in March 2017 for services performed at Johns Hopkins Hospital in March 2017. Alice was a patient at Johns Hopkins Hospital from January 12th, 2017 to February 20th, 2017.

% Question
% Section 3306(c)(10)(B) applies to Alice's employment situation in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
hospital_("Johns Hopkins Hospital").
agent_("Johns Hopkins Hospital","Johns Hopkins Hospital").
service_("services").
patient_("services","Johns Hopkins Hospital").
agent_("services","Alice").
start_("services","2017-03-01").
end_("services","2017-03-31").
payment_("was paid").
agent_("was paid","Johns Hopkins Hospital").
patient_("was paid","Alice").
start_("was paid","2017-03-31").
purpose_("was paid","services").
amount_("was paid",200).
medical_patient_("was a patient").
agent_("was a patient","Alice").
patient_("was a patient","Johns Hopkins Hospital").
start_("was a patient","2017-01-12").
end_("was a patient","2017-02-20").

% Test
:- \+ s3306_c_10_B("services",_,"Alice","2017-03-01").
:- halt.
