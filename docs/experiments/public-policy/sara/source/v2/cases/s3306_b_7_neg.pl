% Text
% Alice has been running a typewriter factory since February 1st, 2016. Bob is an employee at the typewriter factory. On October 2nd 2017, Alice has paid Bob $323 in cash for painting her house.

% Question
% Section 3306(b)(7) applies to the payment Alice made to Bob. Contradiction

% Facts
:- discontiguous s3306_c/5.
:- [statutes/prolog/init].
business_("has been running").
agent_("has been running","Alice").
type_("has been running","typewriter factory").
start_("has been running","2016-02-01").
service_("painting").
patient_("painting","Alice").
agent_("painting","Bob").
type_("painting","painting her house").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-10-02").
end_("paid","2017-10-02").
purpose_("paid","painting").
amount_("paid",323).
means_("paid","cash").

% Test
:- \+ s3306_b_7("paid","painting","Alice","Bob",_,_).
:- halt.
