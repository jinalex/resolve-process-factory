// Draws one recorded step at a time from REPLAY (written into the page by replay/build.ts). Every word shown comes from
// the files Resolve wrote on the recorded run or from replay/steps.json; nothing here decides anything.
(() => {
  const R = window.REPLAY;
  const OUT = { approve: "Approve", incomplete: "Incomplete", request_docs: "Request documents", escalate: "Escalate", decline: "Decline" };
  const KIND = { gap: "Gap", contradiction: "Contradiction", unknowns: "Unknown facts", judgment: "Judgment call", uncovered: "Not covered" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const outcome = (o) => o ? `<span class="outcome ${esc(o)}">${esc(OUT[o] ?? o)}</span>` : `<span class="muted">none</span>`;
  const ref = (r) => R.sop[r] ? `<span class="sop-ref" title="${esc(R.sop[r])}">${esc(r)}</span>` : esc(r);
  const refs = (rs) => rs.map(ref).join(", ");
  const facts = (fs) => fs?.length ? `<ul class="facts">${fs.map((f) => `<li class="${f.read_by_change ? "read" : ""}">${esc(f.name)}${f.item ? ` (${f.list === "people" ? "person" : "item"} ${f.item})` : ""}: ${esc(f.value)}</li>`).join("")}</ul>` : "";
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // The owner's answer to a finding, from the run's last answers file: the choice sent for that finding on that version.
  const answers = R.steps.at(-1).answers;
  const choiceFor = (f, version) => {
    const sent = answers.filter((a) => a.type === "send" && a.spec_version === version).flatMap((a) => a.ids);
    if (!sent.includes(f.id)) return null;
    return answers.filter((a) => a.type === "finding" && a.id === f.id && a.spec_version === version).at(-1)?.choice ?? null;
  };

  function impactHtml(imp) {
    if (!imp) return `<p class="muted">Not worked out yet.</p>`;
    if (imp.problems?.length) return `<p class="chip bad">Can't be used</p><ul>${imp.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
    const bits = [];
    bits.push(imp.keeps_rules ? `<span class="chip accent">Keeps the rules</span>` : imp.resolves ? `<span class="chip good">Removes this finding</span>` : `<span class="chip warn">The finding stays</span>`);
    for (const n of imp.new_findings ?? []) bits.push(`<span class="chip bad">New finding: ${esc(n.title)}</span>`);
    const changes = imp.changes ?? [];
    const scope = imp.searched_items_per_list == null ? "No case decides differently." : `No case with up to ${imp.searched_items_per_list} items in each list decides differently.`;
    const list = changes.length
      ? `<ul>${changes.map((c) => `<li>${outcome(c.from)} → ${outcome(c.to)}: <span class="muted">${esc(c.example)}</span></li>`).join("")}</ul>`
      : `<p class="muted">${imp.keeps_rules ? "No case decides differently." : scope}</p>`;
    const flips = (imp.flips ?? []).length
      ? `<p>Past cases that flip: ${imp.flips.map((x) => `${esc(x.name ?? x.case_id)} ${outcome(x.from)} → ${outcome(x.to)}`).join("; ")}</p>`
      : `<p class="muted">No past case flips.</p>`;
    return `<div class="controls">${bits.join(" ")}</div>${list}${flips}${imp.ms != null ? `<p class="label">Worked out in ${(imp.ms / 1000).toFixed(1)} s</p>` : ""}`;
  }

  function findingHtml(f, spec, i) {
    const chosen = choiceFor(f, spec.version);
    // Shown from the step before the owner sends it, so the reader can follow which option goes ahead.
    const answeredHere = chosen && R.steps.slice(0, i + 2).some((s) => s.answers.some((a) => a.type === "send" && a.spec_version === spec.version && a.ids.includes(f.id)));
    const edits = f.option_edits ?? [];
    const options = edits.length
      ? `<div class="options">${edits.map((o) => {
          const imp = (f.impact ?? []).find((x) => x.option === o.option);
          const isChosen = answeredHere && o.option === chosen;
          return `<div class="option ${isChosen ? "chosen" : ""}"><div class="pick">${esc(o.option)}${isChosen ? ` <span class="chip accent">The owner picks this</span>` : ""}</div><p>${esc(o.says)}</p>${f.impact ? impactHtml(imp) : ""}</div>`;
        }).join("")}</div>`
      : `<p class="muted">No question written yet. Claude writes it in the next step.</p>`;
    const proof = f.proof ? `<details><summary>Show the logic</summary><p>${esc(f.proof.asks)}</p><pre>${esc(f.proof.code)}</pre><p class="label">Z3 answered ${esc(f.proof.answer)} in ${esc(f.proof.ms)} ms</p></details>` : "";
    return `<div class="card">
      <div class="kind">${esc(KIND[f.kind] ?? f.kind)} · SOP ${refs(f.sop_refs)}</div>
      <h3>${esc(f.title)}</h3>
      ${f.example ? `<p>Example: ${esc(f.example)}</p>` : ""}${facts(f.example_facts)}
      <p class="muted">${esc(f.explain)}</p>
      ${f.question ? `<p><strong>${esc(f.question)}</strong></p>` : ""}
      ${options}${proof}</div>`;
  }

  function casesHtml(cases, prev) {
    const before = new Map((prev?.cases ?? []).map((c) => [c.id, c.check?.spec_outcome]));
    const rows = cases.map((c) => {
      const was = before.get(c.id);
      const flipped = prev && was && was !== c.check?.spec_outcome;
      return `<tr class="${flipped ? "flipped" : ""}">
        <td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.id)}</div></td>
        <td>${outcome(c.outcome)}</td>
        <td>${outcome(c.check?.spec_outcome)}${flipped ? `<div class="muted">was ${esc(OUT[was] ?? was)}</div>` : ""}</td>
        <td class="why">${esc(c.decided_by)}${(c.missing ?? []).length ? `<div class="muted">Missing: ${c.missing.map(esc).join(" ")}</div>` : ""}</td>
      </tr>`;
    }).join("");
    return `<div class="table-wrap"><table><thead><tr><th>Case</th><th>The file says</th><th>The rules give</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function answerLine(a) {
    if (a.type === "finding") return `Answered on version ${a.spec_version}: “${esc(a.choice)}”`;
    if (a.type === "send") return `Sent ${plural(a.ids.length, "answer", "answers")} on version ${a.spec_version} as one batch`;
    if (a.type === "approve_spec") return `Approved version ${a.version}, fingerprint <code>${esc(a.spec_hash)}</code>`;
    return esc(JSON.stringify(a));
  }

  function stepHtml(i) {
    const s = R.steps[i], prev = R.steps[i - 1], spec = s.spec;
    const added = s.answers.filter((a) => !(prev?.answers ?? []).some((b) => JSON.stringify(b) === JSON.stringify(a)));
    const sentHere = s.answers.filter((a) => a.type === "send" && a.spec_version === spec.version).flatMap((a) => a.ids);
    const open = spec.findings.filter((f) => !sentHere.includes(f.id));
    const changes = spec.changes_from_previous ?? [];
    const past = spec.past_cases ?? [];
    return `
      <div class="controls">
        <button type="button" id="prev" ${i === 0 ? "disabled" : ""}>Previous</button>
        <span class="label">Step ${i + 1} of ${R.steps.length} · ${esc(s.by)}</span>
        <button type="button" id="next" ${i === R.steps.length - 1 ? "disabled" : ""}>Next</button>
      </div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.text)}</p>
      <div class="ran"><span class="label">What ran${s.seconds ? ` · ${s.seconds} s` : ""}</span><pre>${s.commands.map(esc).join("\n")}</pre>
        ${(s.runs ?? []).length ? `<p class="muted">Claude's calls, saved whole in <code>runs/options/</code>: ${s.runs.map((r) => `<code>${esc(r)}</code>`).join(", ")}</p>` : ""}</div>
      ${added.length ? `<section><h3>What the owner sent</h3><ul>${added.map((a) => `<li>${answerLine(a)}</li>`).join("")}</ul></section>` : ""}
      <p class="status muted">${esc(s.status?.activity)}</p>
      <section>
        <h3>Spec version ${spec.version} · ${spec.approved ? `<span class="chip good">approved</span>` : `<span class="chip warn">not approved</span>`} <span class="muted">fingerprint <code>${esc(spec.spec_hash)}</code></span></h3>
        ${(spec.applied ?? []).length ? `<p class="muted">Answers it holds: ${spec.applied.map((a) => `“${esc(a.choice)}” (added in version ${a.applied_in})`).join("; ")}</p>` : ""}
      </section>
      ${changes.length ? `<section><h3>What decides differently from version ${spec.version - 1}</h3><ul>${changes.map((c) => `<li>${outcome(c.from)} → ${outcome(c.to)}: <span class="muted">${esc(c.example)}</span></li>`).join("")}</ul>
        ${past.length ? `<p>Example cases that flip: ${past.map((p) => `${esc(p.name)} ${outcome(p.previous_spec_decision)} → ${outcome(p.spec_decision)} <span class="muted">(${esc(p.why)})</span>`).join("; ")}</p>` : ""}</section>` : ""}
      <section>
        <h3>Z3's findings on the SOP · ${spec.findings.length ? `${open.length} of ${spec.findings.length} open` : "none"}</h3>
        ${spec.findings.length ? spec.findings.map((f) => findingHtml(f, spec, i)).join("") : `<p class="muted">Z3 finds no rule that can never apply, no rule that treats an unknown differently from 2.2, and no fact that never changes an outcome.</p>`}
      </section>
      <section>
        <h3>The six example case files under version ${spec.version}</h3>
        ${casesHtml(s.cases.cases, prev?.cases)}
      </section>`;
  }

  const nav = document.getElementById("steps"), body = document.getElementById("step");
  nav.innerHTML = `<ol>${R.steps.map((s, i) => `<li><button type="button" data-i="${i}"><span class="n">${i + 1}</span><span>${esc(s.title)}<span class="by">${esc(s.by)} · version ${s.spec.version}</span></span></button></li>`).join("")}</ol>`;
  let current = 0;
  function go(i) {
    current = Math.max(0, Math.min(R.steps.length - 1, i));
    body.innerHTML = stepHtml(current);
    nav.querySelectorAll("button").forEach((b) => b.removeAttribute("aria-current"));
    nav.querySelector(`button[data-i="${current}"]`).setAttribute("aria-current", "step");
    document.getElementById("prev").onclick = () => go(current - 1);
    document.getElementById("next").onclick = () => go(current + 1);
    try { history.replaceState(null, "", `#step-${current + 1}`); } catch (e) { /* hash routing is a convenience */ }
  }
  nav.addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) go(Number(b.dataset.i)); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  });
  const fromHash = () => { const m = /^#step-(\d+)$/.exec(location.hash); return m ? Number(m[1]) - 1 : 0; };
  window.addEventListener("hashchange", () => { if (fromHash() !== current) go(fromHash()); });
  go(fromHash());
})();
