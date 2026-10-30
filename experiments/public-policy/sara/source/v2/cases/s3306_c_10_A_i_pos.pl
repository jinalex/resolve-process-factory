% Text
% Alice was paid $3200 in 2017 for services performed for Johns Hopkins University. Alice was enrolled at Johns Hopkins University and attending classes from August 29, 2015 to May 30th, 2019.

% Question
% Section 3306(c)(10)(A)(i) applies to Alice's employment situation in 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("services").
patient_("services","Johns Hopkins University").
agent_("services","Alice").
start_("services","2017-01-01").
end_("services","2017-12-31").
payment_("was paid").
agent_("was paid","Johns Hopkins University").
patient_("was paid","Alice").
start_("was paid","2017-12-31").
purpose_("was paid","services").
amount_("was paid",3200).
educational_institution_("Johns Hopkins University").
agent_("Johns Hopkins University","Johns Hopkins University").
enrollment_("was enrolled").
agent_("was enrolled","Alice").
patient_("was enrolled","Johns Hopkins University").
start_("was enrolled","2015-08-29").
end_("was enrolled","2019-05-30").
attending_classes_("attending classes").
agent_("attending classes","Alice").
location_("attending classes","Johns Hopkins University").
start_("attending classes","2015-08-29").
end_("attending classes","2019-05-30").

% Test
:- s3306_c_10_A("services","Johns Hopkins University","Alice","2017-01-01"),
    s3306_c_10_A_i("Alice","Johns Hopkins University","2017-01-01").
:- halt.
