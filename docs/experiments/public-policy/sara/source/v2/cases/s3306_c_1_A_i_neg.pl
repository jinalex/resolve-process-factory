% Text
% Alice has paid $2300 to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017, in Caracas, Venezuela. Alice and Bob are both American citizens.

% Question
% Section 3306(c)(1)(A)(i) applies to Alice employing Bob for the year 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
location_("agricultural labor","Caracas, Venezuela").
country_("Caracas, Venezuela", "Venezuela").
purpose_("agricultural labor","agricultural labor").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2017-09-02").
purpose_("paid","agricultural labor").
amount_("paid",2300).
citizenship_("American citizens").
agent_("American citizens","Alice").
agent_("American citizens","Bob").
patient_("American citizens","USA").

% Test
:- \+ s3306_c_1_A_i("Alice",_,"Bob",_,2017).
:- halt.
