import React, { useMemo, useState, useRef } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import JSZip from "jszip";
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
  const attachmentsRef = useRef({}); // { [disclosureId]: File[] }

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
    const list = [...(data.disclosures || []), { id: uid(), label: "", provided: false, notes: "" }];
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

  const setAttachments = (id, files) => {
    attachmentsRef.current[id] = Array.from(files || []);
    // store count so the UI persists a hint across refresh in this session
    update({ disclosures: (data.disclosures||[]).map(d => d.id===id ? { ...d, _filesCount: (files?.length||0) } : d) });
  };

  const exportDeadlinesICS = () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Financial Organizer//Divorce Deadlines//EN'
    ];
    (data.deadlines||[]).forEach(d => {
      if (!d.dateISO) return;
      const dt = d.dateISO.replaceAll('-', '');
      const uidStr = (d.id || uid()) + '@financial-organizer';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uidStr}`);
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      lines.push(`DTEND;VALUE=DATE:${dt}`);
      lines.push(`SUMMARY:${(d.label||'Deadline')}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'divorce-deadlines.ics'; a.click();
    URL.revokeObjectURL(url);
  };

  const generateDisclosuresPacketPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const title = "Initial Disclosures Packet";
    doc.setFontSize(16);
    doc.text(title, 40, 40);

    doc.setFontSize(10);
    doc.text(`Case type: ${data.caseType || "-"}`, 40, 62);
    doc.text(`Filing state: ${data.filingState || "-"}`, 40, 76);
    doc.text(`Children: ${typeof data.children === "number" ? data.children : "-"}`, 40, 90);

    const addTable = (head, rows) => {
      // @ts-ignore
      doc.autoTable({ head: [head], body: rows, startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 18 : 110, styles: { fontSize: 9 }, headStyles: { fillColor: [240,240,240] } });
    };

    const contacts = (data.attorneyContacts || []).map(c => [c.name||"", c.role||"", c.email||"", c.phone||""]);
    if (contacts.length) addTable(["Name","Role","Email","Phone"], contacts);

    const disclosures = (data.disclosures || []).map(x => [x.label||"", x.provided?"Yes":"No", x.notes||""]);
    addTable(["Disclosure","Provided","Notes"], disclosures);

    doc.setFontSize(8);
    const y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 18 : 110;
    doc.text("Informational only. Not legal advice.", 40, y);
    doc.save(`disclosures-packet-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const buildEvidenceZip = async () => {
    const zip = new JSZip();
    const root = zip.folder('evidence');
    const today = new Date().toISOString().slice(0,10).replaceAll('-', '');
    const sanitize = (s) => (s||'item').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'item';
    const items = data.disclosures || [];
    for (const d of items) {
      const files = attachmentsRef.current[d.id] || [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || 'dat');
        const base = `${today}-${sanitize(d.label)}`;
        const name = `${base}-${sanitize(f.name.replace(/\.[^.]+$/, ''))}.${ext}`;
        const buf = await f.arrayBuffer();
        root.file(name, buf);
      }
    }
    // Include a manifest and the packet PDF skeleton as text (optional)
    const manifest = [
      '# Evidence Bundle Manifest',
      `Generated: ${new Date().toISOString()}`,
      '',
      ...items.map(d => `- ${d.label||'Unnamed'}${d.notes?` — ${d.notes}`:''} ${d._filesCount?`[${d._filesCount} file(s)]`:''}`)
    ].join('\n');
    root.file('MANIFEST.txt', manifest);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `evidence-bundle-${new Date().toISOString().slice(0,10)}.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  const generateDiscoveryRequestsPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Discovery Requests', 40, 40);
    doc.setFontSize(10);
    doc.text('Requests for Production', 40, 65);
    const list = (data.disclosures||[]).map((d,i)=>`${i+1}. All documents relating to: ${d.label}${d.notes?` (${d.notes})`:''}.`);
    const wrap = (s, x, y, mw)=>{ const lines = doc.splitTextToSize(s, mw); doc.text(lines, x, y); return y + lines.length*12 + 6; };
    let y = 80;
    for (const line of list) { y = wrap(line, 40, y, 520); }
    y += 12;
    doc.text('Interrogatories', 40, y); y += 18;
    const inter = [
      'Identify all financial accounts held individually or jointly since the date of marriage, including institution, account type, and last four digits.',
      'State your monthly income sources and amounts and describe any irregular or bonus income in the last 24 months.',
      'Describe all debts owed individually or jointly, including creditor, balance, and purpose of the debt.'
    ];
    inter.forEach((t)=>{ y = wrap(`- ${t}`, 40, y, 520); });
    doc.save(`discovery-requests-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // --- Guided Entry: determine next field to fill and focus helpers ---
  const focusSelector = (sel) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el && el.focus) setTimeout(()=>el.focus(), 250);
  };

  const guidedNext = useMemo(() => {
    // Filing state
    if (!data.filingState) return { kind: 'field', label: 'Enter Filing state', selector: '[data-field="filingState"]' };
    // Add first contact if none
    if (!Array.isArray(data.attorneyContacts) || data.attorneyContacts.length === 0) return { kind: 'action', label: 'Add a contact', action: addContact };
    // Contact fields
    const c = data.attorneyContacts[0];
    if (!c.name) return { kind: 'field', label: 'Contact name', selector: `[data-field="contact-name-${c.id}"]` };
    if (!c.email) return { kind: 'field', label: 'Contact email', selector: `[data-field="contact-email-${c.id}"]` };
    if (!c.phone) return { kind: 'field', label: 'Contact phone', selector: `[data-field="contact-phone-${c.id}"]` };
    // Support fields
    if (!data.support?.startDateISO) return { kind: 'field', label: 'Support start date', selector: '[data-field="support-start"]' };
    if (typeof data.support?.requestedAlimonyMonthly !== 'number') return { kind: 'field', label: 'Requested alimony (monthly)', selector: '[data-field="support-alimony"]' };
    if (typeof data.support?.requestedChildSupportMonthly !== 'number') return { kind: 'field', label: 'Requested child support (monthly)', selector: '[data-field="support-child"]' };
    // Disclosures
    if (!Array.isArray(data.disclosures) || data.disclosures.length === 0) return { kind: 'action', label: 'Build disclosures', action: buildDisclosures };
    const firstEmpty = (data.disclosures||[]).find(d => !d.label || (d.label||'').trim()==='');
    if (firstEmpty) return { kind: 'field', label: 'Disclosure label', selector: `[data-field="disclosure-label-${firstEmpty.id}"]` };
    return { kind: 'done', label: 'All essential fields are filled' };
  }, [data]);

  const buildDeadlines = () => {
    const filingISO = (data.support?.startDateISO) || new Date().toISOString().slice(0,10);
    const hasKids = typeof data.children === "number" && data.children > 0;
    const contested = (data.caseType || "").toLowerCase().includes("contested");
    const deadlines = computeDivorceDeadlines(filingISO, contested, hasKids, data.deadlineRules).map(d => ({ id: uid(), ...d }));
    update({ deadlines });
  };

  const buildDisclosures = () => {
    const hasKids = typeof data.children === "number" && data.children > 0;
    const disclosures = defaultDisclosures(hasKids).map(d => ({ id: uid(), ...d }));
    update({ disclosures });
  };

  return (
    <div className="space-y-4">
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
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm text-gray-600">Adjust deadline rules</summary>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            {[
              {k:'financialDisclosureDays', label:'Financial disclosure due (days)'},
              {k:'initialExchangeDays', label:'Initial disclosures exchange (days)'},
              {k:'parentingPlanDays', label:'Parenting plan draft (days)'},
              {k:'mediationDays', label:'Mediation/settlement (days)'}
            ].map(r => (
              <Field key={r.k} label={r.label}>
                <input type="number" className="w-full border rounded px-2 py-1" value={(data.deadlineRules?.[r.k] ?? '')}
                  onChange={e => update({ deadlineRules: { ...(data.deadlineRules||{}), [r.k]: Number(e.target.value||0) } })} />
              </Field>
            ))}
          </div>
        </details>
      </Card>
      {/* Guided Entry bar */}
      <Card title="Guided Entry">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex-1">{guidedNext.label}</div>
          {guidedNext.kind === 'field' && (
            <button className="px-3 py-1 border rounded" onClick={()=>focusSelector(guidedNext.selector)}>Go to field</button>
          )}
          {guidedNext.kind === 'action' && (
            <button className="px-3 py-1 border rounded" onClick={()=>{ guidedNext.action?.(); setTimeout(()=>{ /* allow UI to render */ }, 0); }}>Do it</button>
          )}
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
            <input data-field="filingState" className="w-full border rounded px-2 py-1" placeholder="e.g., AZ"
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
              <input data-field={`contact-name-${c.id}`} className="border rounded px-2 py-1 col-span-2" placeholder="Name" value={c.name}
                onChange={e => updateContact(c.id, { name: e.target.value })} />
              <input data-field={`contact-email-${c.id}`} className="border rounded px-2 py-1" placeholder="Email" value={c.email}
                onChange={e => updateContact(c.id, { email: e.target.value })} />
              <input data-field={`contact-phone-${c.id}`} className="border rounded px-2 py-1" placeholder="Phone" value={c.phone}
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
              <div key={d.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <input className="border rounded px-2 py-1 md:col-span-3" placeholder="Label"
                  value={d.label} onChange={e => updateDeadline(d.id, { label: e.target.value })} />
                <input type="date" className="border rounded px-2 py-1 md:col-span-2"
                  value={d.dateISO || ""} onChange={e => updateDeadline(d.id, { dateISO: e.target.value })} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!d.done} onChange={e => updateDeadline(d.id, { done: e.target.checked })} />
                  <span className="text-sm">Done</span>
                </label>
                <button className="text-sm px-2 py-1 border rounded" onClick={() => removeDeadline(d.id)}>Remove</button>
              </div>
            ))}
            <button className="px-3 py-1 border rounded" onClick={addDeadline}>Add deadline</button>
            <button className="px-3 py-1 border rounded ml-2" onClick={exportDeadlinesICS}>Export .ics</button>
          </div>
        </div>

        {/* Disclosures */}
        <div>
          <div className="text-sm text-gray-700 mb-1">Disclosures</div>
          <div className="space-y-2">
            {(data.disclosures || []).map(d => (
              <div key={d.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <input data-field={`disclosure-label-${d.id}`} className="border rounded px-2 py-1 md:col-span-4" placeholder="e.g., Financial Affidavit"
                  value={d.label} onChange={e => updateDisclosure(d.id, { label: e.target.value })} />
                <input className="border rounded px-2 py-1 md:col-span-5" placeholder="Notes (where to get it, account, etc.)"
                  value={d.notes||""} onChange={e => updateDisclosure(d.id, { notes: e.target.value })} />
                <label className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" checked={!!d.provided} onChange={e => updateDisclosure(d.id, { provided: e.target.checked })} />
                  <span className="text-sm">Provided</span>
                </label>
                <div className="flex gap-1 md:col-span-1">
                  <label className="text-xs px-2 py-1 border rounded cursor-pointer">
                    <input type="file" multiple className="hidden" onChange={(e)=> setAttachments(d.id, e.target.files)} />Attach
                  </label>
                  <button className="text-sm px-2 py-1 border rounded" title="Remove" onClick={() => removeDisclosure(d.id)}>Remove</button>
                </div>
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
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-2 border rounded" onClick={()=>{ buildDeadlines(); buildDisclosures(); }}>Build All</button>
          <button className="px-3 py-2 border rounded" onClick={()=>{
            const email = (data.attorneyContacts||[]).find(c=>/attorney|mediator/i.test(c.role||''))?.email || '';
            const body = encodeURIComponent([
              'Hello,',
              '',
              'Attached are my initial financial disclosures. Please let me know if you need anything else.',
              '',
              'Checklist:',
              ...(data.disclosures||[]).map(d=>`- ${d.label}: ${d.provided?'Provided':'Pending'}${d.notes?` (${d.notes})`:''}`)
            ].join('\n'));
            const mailto = `mailto:${email}?subject=Initial%20Disclosures&body=${body}`;
            window.location.href = mailto;
          }}>Copy Request Email</button>
        </div>
      </Card>

      {/* Tools */}
      <Card title="Tools">
        <div className="p-1 grid md:grid-cols-3 gap-3 text-sm">
          <div>
            <button className="w-full px-3 py-2 border rounded" onClick={generateDisclosuresPacketPDF}>Disclosures Packet PDF</button>
            <div className="text-xs text-gray-500 mt-1">Creates a clean PDF listing your disclosures with notes and contacts.</div>
          </div>
          <div>
            <button className="w-full px-3 py-2 border rounded" onClick={buildEvidenceZip}>Evidence Bundle (.zip)</button>
            <div className="text-xs text-gray-500 mt-1">Zips attached files, auto‑renamed by item. No uploads; local only.</div>
          </div>
          <div>
            <button className="w-full px-3 py-2 border rounded" onClick={generateDiscoveryRequestsPDF}>Discovery Requests PDF</button>
            <div className="text-xs text-gray-500 mt-1">Drafts requests for production and sample interrogatories from your items.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
