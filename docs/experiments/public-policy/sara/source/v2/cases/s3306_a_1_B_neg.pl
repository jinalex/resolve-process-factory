% Text
% Alice has employed Bob on various occasions during the year 2017:
% - Jan 24
% - Feb 4
% - Mar 3
% - Mar 19
% - Apr 2
% - Oct 25
% - Nov 8
% - Nov 22
% - Dec 1
% - Dec 3

% Question
% Section 3306(a)(1)(B) applies to Alice for the year 2017. Contradiction

% Facts
:- discontiguous s3306_c/5.
:- [statutes/prolog/init].
s3306_c("has employed","Alice","Bob","2017-01-24",_).
s3306_c("has employed","Alice","Bob","2017-02-04",_).
s3306_c("has employed","Alice","Bob","2017-03-03",_).
s3306_c("has employed","Alice","Bob","2017-03-19",_).
s3306_c("has employed","Alice","Bob","2017-04-02",_).
s3306_c("has employed","Alice","Bob","2017-10-25",_).
s3306_c("has employed","Alice","Bob","2017-11-08",_).
s3306_c("has employed","Alice","Bob","2017-11-22",_).
s3306_c("has employed","Alice","Bob","2017-12-01",_).
s3306_c("has employed","Alice","Bob","2017-12-03",_).

% Test
:- \+ s3306_a_1_B("Alice",_,_,2017).
:- halt.
