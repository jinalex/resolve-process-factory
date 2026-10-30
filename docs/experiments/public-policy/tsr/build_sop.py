# Builds sop.md from the regulation's text in source/, word for word. Only section 1 is ours: the outcomes and how
# an unknown fact is treated, which the regulation doesn't say and the rule format needs. Run: python3 build_sop.py
import re
from pathlib import Path

HERE = Path(__file__).parent
ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]

def paragraphs(path):
    # Drop footnote markers: lines that are only a number, left by the eCFR's superscripts.
    lines = [l.strip() for l in (HERE / path).read_text().split("\n")]
    text = "\n".join(l for l in lines if not re.fullmatch(r"\d+", l))
    text = re.sub(r"\s*\n(?=[;,.])", "", text)              # "pay \n for" where a footnote sat mid-sentence
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

def label(p):
    m = re.match(r"\((\w+)\)\s*(.*)", p)
    return (m.group(1), m.group(2)) if m else (None, p)

p3 = paragraphs("source/310.3.txt")
a_intro = label(p3[0])[1]
# (a)(1) and its items (i)-(viii), (viii)'s (A)-(D) joined to it; then (a)(2) and its items (i)-(x); stop at (a)(3).
part, out = None, {"1": [], "2": []}
intro = {}
for p in p3[1:]:
    lab, body = label(p)
    if lab in ("1", "2") and part != lab and (part is None or int(lab) == int(part) + 1):
        part, intro[lab] = lab, body
        continue
    if lab == "3" and part == "2":
        break
    if lab in ROMAN:
        out[part].append([lab, body])
    elif lab in "ABCD" and lab is not None:
        out[part][-1][1] += f" ({lab}) {body}"

used = " ".join([a_intro, intro["1"], intro["2"]] + [b for k in out for _, b in out[k]]).lower()
defs = []
p2 = paragraphs("source/310.2.txt")
for i, p in enumerate(p2):
    lab, body = label(p)
    m = re.match(r"([A-Z][\w\- ]*?) (means|is)[:, ]", body)
    if not lab or not lab.isalpha() or not m:
        if defs and lab and lab.isdigit():
            defs[-1][2] += f" ({lab}) {body}"
        continue
    term = m.group(1).lower()
    defs.append([lab, term, body])
defs = [d for d in defs if re.search(rf"\b{re.escape(d[1])}s?\b", used)]

doc = [
    "# Telemarketing Sales Rule: deceptive acts before and during a sale",
    "",
    "16 CFR 310.3(a)(1) and (a)(2), with the definitions from 16 CFR 310.2 whose terms they use. The text is the eCFR's,"
    " amended to 2025-10-01, word for word; only the numbering is ours, so the rule format can cite it."
    " Section 1 is ours: the regulation names no outcomes and doesn't say what an unknown fact means.",
    "",
    "Known gaps, found in review after the drafts were written: the source text marks footnotes 1 and 2 of 310.3 but"
    " doesn't contain them (they are in source/310.3-footnotes.txt; footnote 1 makes debt-relief disclosures due before"
    " enrollment), so no draft covers them. Definitions are kept when their term appears in (a)(1) or (a)(2), so"
    " 310.2(j) \"credit\" is kept for \"credit card\", and \"charitable contribution\" and \"donor\", used only inside kept"
    " definitions, are not.",
    "",
    "Numbering: 2 is 310.3(a) and (a)(1), and 2.1 to 2.8 are (a)(1)(i) to (viii). 3 is (a)(2), and 3.1 to 3.10 are (a)(2)(i) to (x)."
    " 4.1 onwards are definitions from 310.2: " + ", ".join(f"4.{i+1} is 310.2({d[0]})" for i, d in enumerate(defs)) + ".",
    "",
    "## 1. How a case is decided",
    "",
    "This procedure applies the rule below to one telemarketing sale. Every case receives exactly one outcome:",
    "",
    "- **Violation**: the conduct is a deceptive telemarketing act or practice and a violation of the rule.",
    "- **Review**: a required fact has not been established yet. A reviewer finds it before deciding.",
    "- **No violation**: nothing in sections 2 and 3 applies.",
    "",
    "1.1. When more than one outcome applies, the most severe governs: Violation, then Review, then No violation.",
    "",
    "1.2. A fact that has not been established is unknown, not false. If any fact required by this procedure is unknown, the case cannot be cleared as no violation.",
    "",
    "## 2. Disclosures before the customer consents to pay",
    "",
    a_intro,
    "",
    intro["1"],
    "",
]
for i, (_, b) in enumerate(out["1"]):
    doc += [f"2.{i+1}. {b}", ""]
doc += ["## 3. Misrepresentations", "", intro["2"], ""]
for i, (_, b) in enumerate(out["2"]):
    doc += [f"3.{i+1}. {b}", ""]
doc += ["## 4. Definitions", "", "From 16 CFR 310.2.", ""]
for i, (_, _, b) in enumerate(defs):
    doc += [f"4.{i+1}. {b}", ""]
(HERE / "sop.md").write_text("\n".join(doc).rstrip() + "\n")
print(f"2: {len(out['1'])} items, 3: {len(out['2'])} items, 4: {len(defs)} definitions")
