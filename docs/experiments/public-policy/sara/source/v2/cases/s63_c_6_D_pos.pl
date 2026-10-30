% Text
% From 1973 to 2019, the Walter Brown Family Trust II was considered to be a business trust.

% Question
% Section 63(c)(6)(D) applies to the Walter Brown Family Trust II for 1999. Entailment

% Facts
:- [statutes/prolog/init].
business_trust_("a business trust").
agent_("a business trust","Walter Brown Family Trust II").
start_("a business trust","1973-01-01").
end_("a business trust","2019-12-31").

% Test
:- s63_c_6_D("Walter Brown Family Trust II",1999).
:- halt.
