// Draws one recorded step at a time from REPLAY (written into the page by replay/build.ts). Every word shown comes from
// the files Resolve wrote on the recorded run or from replay/steps.json; nothing here decides anything.
// Each step leads with its one-line result; the detail (findings, cases, what changed) sits in lists that open on demand.
(() => {
  const R = window.REPLAY;
  const OUT = { approve: "Approve", incomplete: "Incomplete", request_docs: "Request documents", escalate: "Escalate", decline: "Decline" };
  // The brand's stamp class for each outcome (docs/brand/tokens.css).
  const STAMP = { approve: "o-approve", incomplete: "o-incomplete", request_docs: "o-request", escalate: "o-escalate", decline: "o-decline" };
  const KIND = { gap: "Gap", contradiction: "Contradiction", unknowns: "Unknown facts", judgment: "Judgment call", uncovered: "Not covered" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const outcome = (o) => o ? `<span class="stamp ${STAMP[o] ?? ""}">${esc(OUT[o] ?? o)}</span>` : `<span class="muted">none</span>`;
  const stamp = (text, cls = "") => `<span class="stamp ${cls}">${esc(text)}</span>`;
  const ref = (r) => R.sop[r] ? `<span class="sop-ref" title="${esc(R.sop[r])}">${esc(r)}</span>` : esc(r);
  const refs = (rs) => rs.map(ref).join(", ");
  const facts = (fs) => fs?.length ? `<ul class="facts">${fs.map((f) => `<li class="${f.read_by_change ? "read" : ""}">${esc(f.name)}${f.item ? ` (${f.list === "people" ? "person" : "item"} ${f.item})` : ""}: ${esc(f.value)}</li>`).join("")}</ul>` : "";
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const flip = (from, to) => `<span class="flip">${outcome(from)} <span class="arrow">→</span> ${outcome(to)}</span>`;

  // The owner's answer to a finding, from the run's last answers file: the choice sent for that finding on that version.
  const answers = R.steps.at(-1).answers;
  const choiceFor = (f, version) => {
    const sent = answers.filter((a) => a.type === "send" && a.spec_version === version).flatMap((a) => a.ids);
    if (!sent.includes(f.id)) return null;
    return answers.filter((a) => a.type === "finding" && a.id === f.id && a.spec_version === version).at(-1)?.choice ?? null;
  };

  // A list of kinds of case that decide differently: each row is the change, and opens to the example.
  const changeList = (changes) => `<div class="rows">${changes.map((c) => `<details class="row" data-part="change"><summary>${flip(c.from, c.to)}</summary><p class="muted">${esc(c.example)}</p></details>`).join("")}</div>`;

  function impactHtml(imp) {
    if (!imp) return `<p class="muted">Not worked out yet.</p>`;
    if (imp.problems?.length) return `<div class="tags">${stamp("Can't be used")}</div><ul>${imp.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
    const tags = [imp.keeps_rules ? stamp("Keeps the rules", "plain") : imp.resolves ? stamp("Removes this finding") : stamp("The finding stays", "plain")];
    const lines = (imp.new_findings ?? []).map((n) => `<p>New finding: ${esc(n.title)}</p>`);
    const changes = imp.changes ?? [];
    const scope = imp.searched_items_per_list == null ? "No case decides differently." : `No case with up to ${imp.searched_items_per_list} items in each list decides differently.`;
    lines.push(changes.length
      ? `<details class="more"><summary>${plural(changes.length, "kind of case decides", "kinds of case decide")} differently</summary>${changeList(changes)}</details>`
      : `<p class="muted">${imp.keeps_rules ? "No case decides differently." : scope}</p>`);
    if ((imp.flips ?? []).length) lines.push(`<p>Past cases that flip: ${imp.flips.map((x) => `${esc(x.name ?? x.case_id)} ${flip(x.from, x.to)}`).join("; ")}</p>`);
    return `<div class="impact" data-part="impact"><div class="tags">${tags.join(" ")}${imp.ms != null ? ` <span class="label">${(imp.ms / 1000).toFixed(1)} s</span>` : ""}</div>${lines.join("")}</div>`;
  }

  // The pane's card: kind · SOP refs, the bold title, then (opened) the why, the question and its options, the logic collapsed.
  function findingHtml(f, spec, i, open) {
    const chosen = choiceFor(f, spec.version);
    // Shown from the step before the owner sends it, so the reader can follow which option goes ahead.
    const answeredHere = chosen && R.steps.slice(0, i + 2).some((s) => s.answers.some((a) => a.type === "send" && a.spec_version === spec.version && a.ids.includes(f.id)));
    const edits = f.option_edits ?? [];
    const options = edits.length
      ? `<div class="options">${edits.map((o) => {
          const imp = (f.impact ?? []).find((x) => x.option === o.option);
          const isChosen = answeredHere && o.option === chosen;
          return `<div class="option ${isChosen ? "chosen" : ""}"><div class="pick">${esc(o.option)}${isChosen ? ` <span class="chosen-tag">The owner picks this</span>` : ""}</div><p class="muted" data-part="options">${esc(o.says)}</p>${f.impact ? impactHtml(imp) : ""}</div>`;
        }).join("")}</div>`
      : `<p class="muted">No question yet. Claude writes it in the next step.</p>`;
    const proof = f.proof ? `<details class="more" data-part="logic"><summary>Show the logic</summary><p>${esc(f.proof.asks)}</p><pre>${esc(f.proof.code)}</pre><p class="label">Z3 answered ${esc(f.proof.answer)} in ${esc(f.proof.ms)} ms</p></details>` : "";
    return `<details class="card" name="findings"${open ? " open" : ""}>
      <summary><span class="kind">${esc(KIND[f.kind] ?? f.kind)} · SOP ${refs(f.sop_refs)}</span><span class="title">${esc(f.title)}</span></summary>
      <div class="body">
        <div class="why" data-part="why"><p>${esc(f.explain)}</p>
        ${f.example ? `<p class="muted">Example: ${esc(f.example)}</p>${facts(f.example_facts)}` : ""}</div>
        ${f.question ? `<p class="question" data-part="question">${esc(f.question)}</p>` : ""}
        ${options}${proof}
      </div></details>`;
  }

  // The cases as one summary line, then a row each: the rules' outcome, opening to why. A case that flipped starts open.
  function casesHtml(cases, prev, version) {
    const before = new Map((prev?.cases ?? []).map((c) => [c.id, c.check?.spec_outcome]));
    const counts = new Map();
    for (const c of cases) counts.set(c.check?.spec_outcome, (counts.get(c.check?.spec_outcome) ?? 0) + 1);
    const summary = [...counts].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${n} ${esc((OUT[o] ?? o ?? "none").toLowerCase())}`).join(", ");
    const rows = cases.map((c) => {
      const now = c.check?.spec_outcome, was = before.get(c.id);
      const flipped = prev && was && was !== now;
      const differs = c.outcome && c.outcome !== now;
      return `<details class="row case${flipped ? " flipped" : ""}" data-part="${flipped || differs ? "flips" : "case"}"${flipped || differs ? " open" : ""}>
        <summary><span class="id">${esc(c.id)}</span><span class="nm">${esc(c.name)}</span>${flipped ? `<span class="was">was ${outcome(was)}</span>` : ""}${outcome(now)}</summary>
        <div class="body">
          ${differs && !flipped ? `<p>The file says ${outcome(c.outcome)}.</p>` : ""}
          <p class="muted">${esc(c.decided_by)}</p>
          ${(c.missing ?? []).length ? `<p class="muted">Missing: ${c.missing.map(esc).join(" ")}</p>` : ""}
        </div></details>`;
    }).join("");
    return `<section data-part="cases"><h3>${plural(cases.length, "case", "cases")} under version ${version}: ${summary}</h3><div class="rows">${rows}</div></section>`;
  }

  function answerLine(a) {
    if (a.type === "finding") return `Answered on version ${a.spec_version}: “${esc(a.choice)}”`;
    if (a.type === "send") return `Sent ${plural(a.ids.length, "answer", "answers")} on version ${a.spec_version} as one batch`;
    if (a.type === "approve_spec") return `Approved version ${a.version}, fingerprint <code>${esc(a.spec_hash)}</code>`;
    return esc(JSON.stringify(a));
  }

  const navButtons = (i, where) => `
    <div class="pager ${where}">
      <button type="button" class="quiet" data-go="${i - 1}" ${i === 0 ? "disabled" : ""}>← Previous</button>
      ${where === "bottom" && i < R.steps.length - 1 ? `<button type="button" class="primary" data-go="${i + 1}">Next: ${esc(R.steps[i + 1].title)} →</button>` : `<button type="button" class="quiet" data-go="${i + 1}" ${i === R.steps.length - 1 ? "disabled" : ""}>Next →</button>`}
    </div>`;

  function stepHtml(i) {
    const s = R.steps[i], prev = R.steps[i - 1], spec = s.spec;
    const added = s.answers.filter((a) => !(prev?.answers ?? []).some((b) => JSON.stringify(b) === JSON.stringify(a)));
    const sentHere = s.answers.filter((a) => a.type === "send" && a.spec_version === spec.version).flatMap((a) => a.ids);
    const open = spec.findings.filter((f) => !sentHere.includes(f.id));
    const changes = spec.changes_from_previous ?? [];
    const past = spec.past_cases ?? [];
    return `
      <div class="step-head">
        <div class="meta">
          <span class="label">Step ${i + 1} of ${R.steps.length} · ${esc(s.by)}${s.seconds ? ` · ${s.seconds} s` : ""}</span>
          <button type="button" class="quiet focus-toggle" aria-pressed="${!showAll}">${showAll ? "Highlight the gist" : "Show everything"}</button>
          ${navButtons(i, "top")}
        </div>
        <h2>${esc(s.title)}</h2>
        <p class="result">${esc(s.result)}</p>
        <p data-part="about">${esc(s.text)}</p>
        <div class="tags" data-part="spec">${stamp(`Spec v${spec.version}`, "plain")} ${spec.approved ? stamp("Approved") : stamp("Not approved", "o-incomplete")} <span class="label">fingerprint <code>${esc(spec.spec_hash)}</code></span></div>
        <details class="more" data-part="about"><summary>What ran</summary><pre>${s.commands.map(esc).join("\n")}</pre>
          ${(spec.applied ?? []).length ? `<p class="muted">Answers this version holds: ${spec.applied.map((a) => `“${esc(a.choice)}” (added in version ${a.applied_in})`).join("; ")}</p>` : ""}
          ${(s.runs ?? []).length ? `<p class="muted">Claude's calls, saved whole in <code>runs/options/</code>: ${s.runs.map((r) => `<code>${esc(r)}</code>`).join(", ")}</p>` : ""}</details>
      </div>
      ${added.length ? `<section data-part="sent"><h3>What the owner sent</h3><ul class="sent">${added.map((a) => `<li>${answerLine(a)}</li>`).join("")}</ul></section>` : ""}
      ${changes.length ? `<section data-part="changes"><h3>${plural(changes.length, "kind of case decides", "kinds of case decide")} differently from version ${spec.version - 1}</h3>
        ${past.length ? `<p data-part="flips">Example cases that flip: ${past.map((p) => `<strong>${esc(p.name)}</strong> ${flip(p.previous_spec_decision, p.spec_decision)}`).join("; ")}</p>` : ""}
        ${changeList(changes)}</section>` : ""}
      <section data-part="findings">
        <h3>Z3's findings on the SOP · ${spec.findings.length ? `${open.length} of ${spec.findings.length} open` : "none"}</h3>
        ${spec.findings.length ? `<div class="cards">${spec.findings.map((f, k) => findingHtml(f, spec, i, k === 0)).join("")}</div>` : `<p class="muted">Z3 finds no rule that can never apply, no rule that treats an unknown differently from 2.2, and no fact that never changes an outcome.</p>`}
      </section>
      ${casesHtml(s.cases.cases, prev?.cases, spec.version)}
      ${navButtons(i, "bottom")}`;
  }

  const nav = document.getElementById("steps"), body = document.getElementById("step");
  nav.innerHTML = `<ol>${R.steps.map((s, i) => `<li><button type="button" data-go="${i}" title="${esc(s.title)}"><span class="n">${i + 1}</span><span class="t">${esc(s.short)}</span></button></li>`).join("")}</ol>`;
  let current = 0;
  // The gist: each step names the parts that carry it (focus in steps.json). Those get the highlighter's bar, and every
  // other part fades until it is hovered or focused, or the reader turns the fading off.
  let showAll = false;
  try { showAll = localStorage.getItem("replay-show-all") === "1"; } catch (e) { /* a convenience */ }
  function markGist(focus) {
    body.classList.toggle("all", showAll);
    for (const el of body.querySelectorAll("[data-part]")) {
      if (focus.includes(el.dataset.part)) el.classList.add("gist");
      else if (!focus.some((f) => el.querySelector(`[data-part="${f}"]`))) el.classList.add("dim");
    }
  }
  body.addEventListener("click", (e) => {
    if (!e.target.closest(".focus-toggle")) return;
    showAll = !showAll;
    try { localStorage.setItem("replay-show-all", showAll ? "1" : "0"); } catch (err) { /* a convenience */ }
    go(current);
  });
  function go(i, scroll) {
    if (i < 0 || i >= R.steps.length) return;
    current = i;
    body.innerHTML = stepHtml(current);
    markGist(R.steps[current].focus ?? []);
    nav.querySelectorAll("li").forEach((li, k) => {
      li.className = k < current ? "done" : k === current ? "now" : "later";
      const b = li.querySelector("button");
      if (k === current) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    // From the bottom of a long step, bring the new step's top into view.
    if (scroll && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
    try { history.replaceState(null, "", `#step-${current + 1}`); } catch (e) { /* hash routing is a convenience */ }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-go]");
    if (b && !b.disabled) go(Number(b.dataset.go), !nav.contains(b));
  });
  // One finding open at a time, where the browser doesn't group <details name> itself.
  body.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.open && d.getAttribute?.("name") === "findings") body.querySelectorAll('details[name="findings"][open]').forEach((x) => { if (x !== d) x.open = false; });
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("input, textarea, select")) return;
    if (e.key === "ArrowRight") go(current + 1, true);
    if (e.key === "ArrowLeft") go(current - 1, true);
  });
  const fromHash = () => { const m = /^#step-(\d+)$/.exec(location.hash); return m ? Number(m[1]) - 1 : 0; };
  window.addEventListener("hashchange", () => { if (fromHash() !== current) go(fromHash()); });
  go(Math.min(Math.max(fromHash(), 0), R.steps.length - 1));
})();
