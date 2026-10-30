% Text
% Alice was paid $3200 in 2017 for services performed for Johns Hopkins School of Nursing. Alice was enrolled at Johns Hopkins School of Nursing and attending classes from August 29, 2015 to May 30th, 2019.

% Question
% Section 3306(c)(13) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("services performed").
patient_("services performed","Johns Hopkins School of Nursing").
agent_("services performed","Alice").
start_("services performed","2017-01-01").
end_("services performed","2017-12-31").
payment_("paid").
agent_("paid","Johns Hopkins School of Nursing").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","services performed").
amount_("paid",3200).
nurses_training_school_("Johns Hopkins School of Nursing").
agent_("Johns Hopkins School of Nursing","Johns Hopkins School of Nursing").
enrollment_("enrolled").
agent_("enrolled","Alice").
patient_("enrolled","Johns Hopkins School of Nursing").
start_("enrolled","2015-08-29").
end_("enrolled","2019-05-30").
attending_classes_("attending classes").
agent_("attending classes","Alice").
location_("attending classes","Johns Hopkins School of Nursing").
start_("attending classes","2015-08-29").
end_("attending classes","2019-05-30").

% Test
:- s3306_c_13("services performed",_,_,"2017-01-01").
:- halt.
