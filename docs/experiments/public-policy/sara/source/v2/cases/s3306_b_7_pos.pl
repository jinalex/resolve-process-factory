% Text
% Alice has been running a typewriter factory since February 1st, 2016. Bob is an employee at the typewriter factory. On October 2nd 2017, Alice has given a typewriter of value $323 to Bob in exchange for Bob painting Alice's house.

% Question
% Section 3306(b)(7) applies to the payment Alice made to Bob. Entailment

% Facts
:- discontiguous s3306_c/5.
:- [statutes/prolog/init].
business_("has been running").
agent_("has been running","Alice").
type_("has been running","typewriter factory").
start_("has been running","2016-02-01").
service_("painting Alice's house").
patient_("painting Alice's house","Alice").
agent_("painting Alice's house","Bob").
type_("painting Alice's house","painting Alice's house").
payment_("has given").
agent_("has given","Alice").
patient_("has given","Bob").
start_("has given","2017-10-02").
end_("has given","2017-10-02").
purpose_("has given","painting Alice's house").
amount_("has given",323).
means_("has given","a typewriter of value $323").

% Test
:- s3306_b_7("has given",_,_,_,_,_).
:- halt.
