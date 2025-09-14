import React, { useMemo, useState } from "react";
import { computeDivorceDeadlines, defaultDisclosures, DIVORCE_GUIDED_STEPS } from "../lib/divorceGuides.js";

const uid = () => Math.random().toString(36).slice(2);

function parseCSVLocal(text) {
  const rows = [];
  let cur = ""; let row = []; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      row.push(cur); cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cur.length || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; }
    } else { cur += ch; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.filter(r => r.length && r.some(x => (x ?? "").trim().length)).map(r => {
    const o = {};
    header.forEach((h, idx) => o[(h || "").trim()] = (r[idx] || "").trim());
    return o;
  });
}

const Field = ({ label, children, className = "" }) => (
  <label className={"block mb-3 " + className}>
    <div className="text-sm text-gray-700 mb-1">{label}</div>
    {children}
  </label>
);

const Card = ({ title, children }) => (
  <div className="p-4 border rounded-xl bg-white shadow-sm">
    <div className="font-semibold mb-3">{title}</div>
    {children}
  </div>
);

export default function DivorceTab({ data, setDivorce, parseCSV }) {
  const [csvText, setCsvText] = useState("");
  const parse = parseCSV || parseCSVLocal;
  const stepIdx = Math.max(0, DIVORCE_GUIDED_STEPS.findIndex(s => s.id === (data.wizardStep || "basics")));

  const disclosuresPct = useMemo(() => {
    const total = (data.disclosures?.length || 0);
    if (!total) return 0;
    const done = data.disclosures.filter(d => !!d.provided).length;
    return Math.round((done / total) * 100);
  }, [data.disclosures]);

  const nextDeadline = useMemo(() => {
    const future = (data.deadlines || []).filter(d => !d.done && d.dateISO && new Date(d.dateISO) > new Date());
    future.sort((a,b) => new Date(a.dateISO) - new Date(b.dateISO));
    return future[0] || null;
  }, [data.deadlines]);

  const update = (patch) => setDivorce({ ...data, ...patch });
  const setWizardStep = (id) => update({ wizardStep: id });
  const nextStep = () => setWizardStep(DIVORCE_GUIDED_STEPS[Math.min(DIVORCE_GUIDED_STEPS.length - 1, stepIdx + 1)].id);
  const prevStep = () => setWizardStep(DIVORCE_GUIDED_STEPS[Math.max(0, stepIdx - 1)].id);

  const addContact = () => {
    const list = [...(data.attorneyContacts || []), { id: uid(), name: "", email: "", phone: "", role: "attorney" }];
    update({ attorneyContacts: list });
  };
  const updateContact = (id, patch) => {
    update({ attorneyContacts: (data.attorneyContacts || []).map(c => c.id === id ? { ...c, ...patch } : c) });
  };
  const removeContact = (id) => {
    update({ attorneyContacts: (data.attorneyContacts || []).filter(c => c.id !== id) });
  };

  const addDeadline = () => {
    const list = [...(data.deadlines || []), { id: uid(), label: "", dateISO: "", done: false }];
    update({ deadlines: list });
  };
  const updateDeadline = (id, patch) => {
    update({ deadlines: (data.deadlines || []).map(d => d.id === id ? { ...d, ...patch } : d) });
  };
  const removeDeadline = (id) => {
    update({ deadlines: (data.deadlines || []).filter(d => d.id !== id) });
  };

  const addDisclosure = () => {
    const list = [...(data.disclosures || []), { id: uid(), label: "", provided: false }];
    update({ disclosures: list });
  };
  const updateDisclosure = (id, patch) => {
    update({ disclosures: (data.disclosures || []).map(d => d.id === id ? { ...d, ...patch } : d) });
  };
  const removeDisclosure = (id) => {
    update({ disclosures: (data.disclosures || []).filter(d => d.id !== id) });
  };

  const importContactsCSV = () => {
    const rows = parse(csvText);
    const mapped = rows.map(r => ({
      id: uid(),
      name: r.name || r.Name || "",
      email: r.email || r.Email || "",
      phone: r.phone || r.Phone || "",
      role: (r.role || r.Role || "attorney").toLowerCase()
    }));
    update({ attorneyContacts: [ ...(data.attorneyContacts || []), ...mapped ] });
    setCsvText("");
  };

  const buildDeadlines = () => {
    const filingISO = (data.support?.startDateISO) || new Date().toISOString().slice(0,10);
    const hasKids = typeof data.children === "number" && data.children > 0;
    const contested = (data.caseType || "").toLowerCase().includes("contested");
    const deadlines = computeDivorceDeadlines(filingISO, contested, hasKids).map(d => ({ id: uid(), ...d }));
    update({ deadlines });
  };

  const buildDisclosures = () => {
    const hasKids = typeof data.children === "number" && data.children > 0;
    const disclosures = defaultDisclosures(hasKids).map(d => ({ id: uid(), ...d }));
    update({ disclosures });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Guided Flow */}
      <Card title="Guided Steps">
        <div className="mb-3 text-sm text-gray-700">Follow these steps to create disclosures and related deadlines in order.</div>
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          {DIVORCE_GUIDED_STEPS.map((s, i) => (
            <li key={s.id} className={`${i===stepIdx?"font-medium":""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div>{s.title}</div>
                  <div className="text-xs text-gray-500">{s.description}</div>
                </div>
                {s.id === "deadlines" && (
                  <button className="px-2 py-1 border rounded text-xs" onClick={buildDeadlines}>Auto-Build</button>
                )}
                {s.id === "disclosures" && (
                  <button className="px-2 py-1 border rounded text-xs" onClick={buildDisclosures}>Auto-Build</button>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1 border rounded" onClick={prevStep} disabled={stepIdx===0}>Prev</button>
          <button className="px-3 py-1 border rounded" onClick={nextStep} disabled={stepIdx===DIVORCE_GUIDED_STEPS.length-1}>Next</button>
        </div>
      </Card>
      {/* Case & Contacts */}
      <Card title="Case & Contacts">
        {/* Case fields */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Case type">
            <select className="w-full border rounded px-2 py-1"
              value={data.caseType || "dissolution"}
              onChange={e => update({ caseType: e.target.value })}>
              <option value="dissolution">Dissolution</option>
              <option value="legal-separation">Legal separation</option>
              <option value="annulment">Annulment</option>
            </select>
          </Field>
          <Field label="Filing state">
            <input className="w-full border rounded px-2 py-1" placeholder="e.g., AZ"
              value={data.filingState || ""}
              onChange={e => update({ filingState: e.target.value })} />
          </Field>
          <Field label="Children">
            <input type="number" min="0" className="w-full border rounded px-2 py-1"
              value={data.children ?? 0}
              onChange={e => update({ children: Math.max(0, Number(e.target.value || 0)) })} />
          </Field>
        </div>

        {/* Contacts */}
        <div className="mb-2 font-medium">Attorney / Mediator Contacts</div>
        <div className="space-y-2">
          {(data.attorneyContacts || []).map(c => (
            <div key={c.id} className="grid grid-cols-5 gap-2 items-center">
              <input className="border rounded px-2 py-1 col-span-2" placeholder="Name" value={c.name}
                onChange={e => updateContact(c.id, { name: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="Email" value={c.email}
                onChange={e => updateContact(c.id, { email: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="Phone" value={c.phone}
                onChange={e => updateContact(c.id, { phone: e.target.value })} />
              <select className="border rounded px-2 py-1" value={c.role}
                onChange={e => updateContact(c.id, { role: e.target.value })}>
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="mediator">Mediator</option>
              </select>
              <button className="text-sm px-2 py-1 border rounded col-span-5 md:col-span-1"
                onClick={() => removeContact(c.id)}>Remove</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded" onClick={addContact}>Add contact</button>
            <details>
              <summary className="cursor-pointer select-none text-sm text-gray-600">CSV import</summary>
              <div className="mt-2">
                <div className="text-xs text-gray-600 mb-1">Headers: name,email,phone,role</div>
                <textarea className="w-full border rounded p-2 h-24" placeholder="name,email,phone,role\nJane Doe,jane@law.com,555-1234,attorney"
                  value={csvText} onChange={e => setCsvText(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button className="px-3 py-1 border rounded" onClick={importContactsCSV}>Import</button>
                  <button className="px-3 py-1 border rounded" onClick={() => setCsvText("")}>Clear</button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </Card>

      {/* Deadlines & Disclosures */}
      <Card title="Deadlines & Disclosures">
        {/* Deadlines */}
        <div className="mb-3">
          <div className="text-sm text-gray-700 mb-1">Deadlines</div>
          <div className="space-y-2">
            {(data.deadlines || []).map(d => (
              <div key={d.id} className="grid grid-cols-6 gap-2 items-center">
                <input className="border rounded px-2 py-1 col-span-3" placeholder="Label"
                  value={d.label} onChange={e => updateDeadline(d.id, { label: e.target.value })} />
                <input type="date" className="border rounded px-2 py-1 col-span-2"
                  value={d.dateISO || ""} onChange={e => updateDeadline(d.id, { dateISO: e.target.value })} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!d.done} onChange={e => updateDeadline(d.id, { done: e.target.checked })} />
                  <span className="text-sm">Done</span>
                </label>
                <button className="text-sm px-2 py-1 border rounded" onClick={() => removeDeadline(d.id)}>Remove</button>
              </div>
            ))}
            <button className="px-3 py-1 border rounded" onClick={addDeadline}>Add deadline</button>
          </div>
        </div>

        {/* Disclosures */}
        <div>
          <div className="text-sm text-gray-700 mb-1">Disclosures</div>
          <div className="space-y-2">
            {(data.disclosures || []).map(d => (
              <div key={d.id} className="grid grid-cols-6 gap-2 items-center">
                <input className="border rounded px-2 py-1 col-span-4" placeholder="e.g., Financial Affidavit"
                  value={d.label} onChange={e => updateDisclosure(d.id, { label: e.target.value })} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!d.provided} onChange={e => updateDisclosure(d.id, { provided: e.target.checked })} />
                  <span className="text-sm">Provided</span>
                </label>
                <button className="text-sm px-2 py-1 border rounded" onClick={() => removeDisclosure(d.id)}>Remove</button>
              </div>
            ))}
            <button className="px-3 py-1 border rounded" onClick={addDisclosure}>Add disclosure</button>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-700">
          <div>Checklist complete: <strong>{disclosuresPct}%</strong></div>
          {nextDeadline ? (
            <div>Next deadline: <strong>{nextDeadline.label || "Untitled"}</strong> on <strong>{nextDeadline.dateISO}</strong></div>
          ) : (
            <div>No upcoming deadlines.</div>
          )}
          <div className="text-xs text-gray-500 mt-2">Informational only; not legal advice.</div>
        </div>
      </Card>

      {/* Support Requests */}
      <Card title="Support Requests">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Requested alimony (monthly)">
            <input type="number" min="0" className="w-full border rounded px-2 py-1"
              value={data.support?.requestedAlimonyMonthly ?? ""}
              onChange={e => update({ support: { ...(data.support || {}), requestedAlimonyMonthly: Number(e.target.value || 0) } })} />
          </Field>
          <Field label="Requested child support (monthly)">
            <input type="number" min="0" className="w-full border rounded px-2 py-1"
              value={data.support?.requestedChildSupportMonthly ?? ""}
              onChange={e => update({ support: { ...(data.support || {}), requestedChildSupportMonthly: Number(e.target.value || 0) } })} />
          </Field>
          <Field label="Support start date">
            <input type="date" className="w-full border rounded px-2 py-1"
              value={data.support?.startDateISO || ""}
              onChange={e => update({ support: { ...(data.support || {}), startDateISO: e.target.value } })} />
          </Field>
        </div>
        <div className="text-xs text-gray-500 mt-3">
          These are user-entered values for planning. Your financial scenarios can compare these against modeled affordability.
        </div>
      </Card>
    </div>
  );
}
