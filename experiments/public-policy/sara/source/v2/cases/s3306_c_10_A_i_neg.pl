% Text
% Alice was paid $3200 in 2017 for services performed for Johns Hopkins University. Alice was enrolled at Johns Hopkins University and attending classes from August 27, 2011 to May 29th, 2016.

% Question
% Section 3306(c)(10)(A)(i) applies to Alice's employment situation in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
educational_institution_("Johns Hopkins University").
agent_("Johns Hopkins University","Johns Hopkins University").
service_("services").
patient_("services","Johns Hopkins University").
agent_("services","Alice").
start_("services","2017-01-01").
end_("services","2017-12-31").
payment_("paid").
agent_("paid","Johns Hopkins University").
patient_("paid","Alice").
start_("paid","2017-12-31").
purpose_("paid","services").
amount_("paid",3200).
enrollment_("was enrolled").
agent_("was enrolled","Alice").
patient_("was enrolled","Johns Hopkins University").
start_("was enrolled","2011-08-27").
end_("was enrolled","2016-05-29").
attending_classes_("attending classes").
agent_("attending classes","Alice").
location_("attending classes","Johns Hopkins University").
start_("attending classes","2011-08-27").
end_("attending classes","2016-05-29").

% Test
:- \+ s3306_c_10_A_i("Alice","Johns Hopkins University","2017-01-01").
:- halt.
