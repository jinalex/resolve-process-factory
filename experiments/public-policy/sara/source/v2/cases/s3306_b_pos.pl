% Text
% Over the year 2018, Alice has paid $2325 in cash to Bob for walking her dog.

% Question
% Section 3306(b) applies to the money paid by Alice to Bob for the year 2018. Entailment

% Facts
:- [statutes/prolog/init].
service_("walking her dog").
patient_("walking her dog","Alice").
agent_("walking her dog","Bob").
start_("walking her dog","2018-01-01").
end_("walking her dog","2018-12-31").
purpose_("walking her dog","walking her dog").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2018-01-01").
end_("paid","2018-12-31").
purpose_("paid","walking her dog").
amount_("paid",2325).
means_("paid","cash").

% Test
:- s3306_b(_,"paid",_,_,_,_,_,_).
:- halt.
