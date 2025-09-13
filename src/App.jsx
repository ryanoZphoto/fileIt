import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import DivorceTab from "./components/DivorceTab.jsx";
import { ensureDivorceDefaults } from "./lib/divorceDefaults.js";

// --- utils ---
const currency = (n) => {
  if (Number.isNaN(Number(n))) return "$0.00";
  return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
};
const num = (n) => (n === "" || n === null || typeof n === "undefined" ? 0 : Number(n));
const uid = () => Math.random().toString(36).slice(2);

function parseCSV(text) {
  const rows = [];
  let cur = ""; let row = []; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) { row.push(cur); cur = ""; }
    else if ((c === '\\n' || c === '\\r') && !inQuotes) { if (cur !== "" || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; } }
    else { cur += c; }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length && r.some(v => v !== ""));
}

const xorCipher = {
  enc: (text, key) => {
    if (!key) return text;
    const k = Array.from(key).reduce((a, c) => a + c.charCodeAt(0), 0) || 1;
    return btoa(Array.from(text).map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ (k + (i % 251)))).join(""));
  },
  dec: (b64, key) => {
    if (!key) return b64;
    const raw = atob(b64);
    const k = Array.from(key).reduce((a, c) => a + c.charCodeAt(0), 0) || 1;
    return Array.from(raw).map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ (k + (i % 251)))).join("");
  }
};

const STORAGE_KEY = "financial-organizer:v1";
const numClass = (v) => `w-full border rounded px-2 py-1 ${num(v) < 0 ? "border-red-500" : ""}`;

function useHistoryState(initial) {
  const [history, setHistory] = useState(() => {
    let start = ensureDivorceDefaults(initial);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) start = ensureDivorceDefaults(JSON.parse(raw));
    } catch { /* ignore */ }
    return { past: [], present: start, future: [] };
  });

  const set = (updater) => {
    setHistory((h) => {
      const next = typeof updater === "function" ? updater(h.present) : updater;
      const past = [...h.past, h.present].slice(-10);
      return { past, present: next, future: [] };
    });
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const past = [...h.past];
      const previous = past.pop();
      return { past, present: previous, future: [h.present, ...h.future] };
    });
  };

  const redo = () => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const [next, ...future] = h.future;
      return { past: [...h.past, h.present].slice(-10), present: next, future };
    });
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.present));
  }, [history.present]);

  return [history.present, set, undo, redo];
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"
];

const BASE_CHECKLIST = [
  { id: uid(), label: "Last 3 years of tax returns (federal & state)", cat: "Income" },
  { id: uid(), label: "Recent pay stubs (last 3 months)", cat: "Income" },
  { id: uid(), label: "Bank account statements (last 12 months)", cat: "Assets" },
  { id: uid(), label: "Investment/retirement account statements (last 12 months)", cat: "Assets" },
  { id: uid(), label: "Mortgage/HELOC statements and property deeds", cat: "Assets" },
  { id: uid(), label: "Vehicle titles and loan statements", cat: "Assets" },
  { id: uid(), label: "Credit card statements (last 12 months)", cat: "Debts" },
  { id: uid(), label: "Personal/auto/student loan statements", cat: "Debts" },
  { id: uid(), label: "Health insurance & medical expense records", cat: "Expenses" },
  { id: uid(), label: "Childcare/school/tuition invoices", cat: "Expenses" },
  { id: uid(), label: "Household bills (utilities, phone, internet)", cat: "Expenses" },
  { id: uid(), label: "Business ownership docs (if applicable)", cat: "Business" },
  { id: uid(), label: "Marriage/relationship agreements (if any)", cat: "Legal" },
];

const defaultState = {
  profile: { fullName: "", email: "", state: "AZ", disclaimerAccepted: false },
  checklist: BASE_CHECKLIST.map(i => ({ ...i, done: false })),
  documents: [],
  assets: [],
  liabilities: [],
  income: [],
  expenses: [],
  scenarios: {
    base: { name: "Current", alimony: 0, childSupport: 0, keepHouse: true, houseValue: 0, mortgageBalance: 0, mortgagePayment: 0, propertyTaxMonthly: 0, insuranceMonthly: 0 },
    altA: { name: "Alt A", alimony: 0, childSupport: 0, keepHouse: false },
  },
  notes: "",
};

const freqToMonthly = (amt, freq) => {
  switch ((freq||"monthly").toLowerCase()) {
    case "weekly": return num(amt) * 52 / 12;
    case "biweekly": return num(amt) * 26 / 12;
    case "annual": return num(amt) / 12;
    case "monthly": default: return num(amt);
  }
};

function autoBuildScenarios(base) {
  const b = { ...base };
  const scenarios = [];

  scenarios.push({
    name: "Sell House",
    keepHouse: false,
    houseValue: 0,
    mortgageBalance: 0,
    mortgagePayment: 0,
    propertyTaxMonthly: 0,
    insuranceMonthly: 0,
    alimony: b.alimony || 0,
    childSupport: b.childSupport || 0
  });

  scenarios.push({
    name: "Refi",
    keepHouse: true,
    houseValue: b.houseValue || 0,
    mortgageBalance: b.mortgageBalance || 0,
    mortgagePayment: Math.max(0, Math.round((b.mortgagePayment || 0) * 0.85)),
    propertyTaxMonthly: b.propertyTaxMonthly || 0,
    insuranceMonthly: b.insuranceMonthly || 0,
    alimony: b.alimony || 0,
    childSupport: b.childSupport || 0
  });

  scenarios.push({
    name: "Trim 10%",
    ...b,
    alimony: b.alimony || 0,
    childSupport: b.childSupport || 0,
    _expenseReductionPct: 10
  });

  scenarios.push({
    name: "Side Income",
    ...b,
    alimony: b.alimony || 0,
    childSupport: b.childSupport || 0,
    _extraIncomeMo: 300
  });

  return scenarios;
}

function useInsights(data, monthlyIncome, monthlyExpenses, cashFlow) {
  const tips = [];
  if (cashFlow < 0) {
    tips.push({ id: "trim10", text: "Cash flow is negative. Try a 10% trim to non-housing expenses.", action: { type: "applyTrim10" }});
  }
  const cc = data.liabilities.filter(l => (l.name||"").toLowerCase().includes("card") && num(l.rate) > 15);
  if (cc.length) {
    tips.push({ id: "highAPR", text: "High APR credit card detected. Consider consolidating or payoff plan.", action: null });
  }
  if (data.scenarios.base.keepHouse && num(data.scenarios.base.mortgagePayment) > monthlyIncome * 0.35) {
    tips.push({ id: "housingRatio", text: "Mortgage over ~35% of income. Explore refinance or sell scenario.", action: { type: "applyRefi" }});
  }
  return tips;
}

function computeDivorceDeadlines(filingISO, contested, hasKids) {
  const base = filingISO ? new Date(filingISO) : new Date();
  const addDays = (n) => new Date(base.getTime() + n*24*60*60*1000).toISOString().slice(0,10);
  const items = [
    { label: "Financial disclosure due", dateISO: addDays(30), done: false },
    { label: "Initial disclosures exchange", dateISO: addDays(45), done: false },
    { label: "Parenting plan draft", dateISO: addDays(hasKids ? 20 : 0), done: !hasKids }
  ];
  if (contested) items.push({ label: "Mediation/settlement conference", dateISO: addDays(60), done: false });
  return items;
}

function defaultDisclosures(hasKids) {
  const x = [
    { label: "Income documentation (pay stubs / 1099s)", provided: false },
    { label: "Tax returns (3 years)", provided: false },
    { label: "Bank statements (12 months)", provided: false },
    { label: "Retirement/investment statements (12 months)", provided: false },
    { label: "Debt statements (12 months)", provided: false }
  ];
  if (hasKids) x.push({ label: "Childcare/education expenses", provided: false });
  return x;
}

function parseQuickLine(s) {
  const m = s.trim().match(/^([a-zA-Z ]+)\s+(\d+(?:\.\d+)?)\s+(weekly|biweekly|monthly|annual)$/i);
  if (!m) return null;
  return { name: m[1].trim(), amount: Number(m[2]), frequency: m[3].toLowerCase() };
}

export default function App() {
  const [data, setData, undo, redo] = useHistoryState(defaultState);
  const [tab, setTab] = useState("welcome");
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");

  const fileRef = useRef(null);
  const csvRef = useRef(null);

  // --- derived values ---
  const netWorth = useMemo(() => {
    const assets = data.assets.reduce((a, b) => a + num(b.value), 0) + (data.scenarios.base.keepHouse ? num(data.scenarios.base.houseValue) - num(data.scenarios.base.mortgageBalance) : 0);
    const debts = data.liabilities.reduce((a, b) => a + num(b.balance), 0);
    return assets - debts;
  }, [data.assets, data.liabilities, data.scenarios.base]);

  const monthlyIncome = useMemo(() => {
    const base = data.income.reduce((a, b) => a + freqToMonthly(b.amount, b.frequency), 0);
    return base + num(data.scenarios.base.alimony) + num(data.scenarios.base.childSupport);
  }, [data.income, data.scenarios.base]);

  const monthlyExpenses = useMemo(() => {
    const base = data.expenses.reduce((a, b) => a + freqToMonthly(b.amount, b.frequency), 0);
    const house = data.scenarios.base.keepHouse ? (num(data.scenarios.base.mortgagePayment) + num(data.scenarios.base.propertyTaxMonthly) + num(data.scenarios.base.insuranceMonthly)) : 0;
    return base + house;
  }, [data.expenses, data.scenarios.base]);

  const cashFlow = useMemo(() => monthlyIncome - monthlyExpenses, [monthlyIncome, monthlyExpenses]);

  // --- helpers to mutate lists ---
  const addRow = (key, row) => setData(d => ({ ...d, [key]: [...d[key], { id: uid(), ...row }] }));
  const updateRow = (key, id, patch) => setData(d => ({ ...d, [key]: d[key].map(r => r.id === id ? { ...r, ...patch } : r) }));
  const removeRow = (key, id) => setData(d => ({ ...d, [key]: d[key].filter(r => r.id !== id) }));

  // --- import/export JSON ---
  const exportJSON = () => {
    const plain = JSON.stringify(data);
    const payload = xorCipher.enc(plain, exportPassword);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financial-organizer-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        let raw = text;
        try { raw = xorCipher.dec(text, importPassword); } catch (err) { void err; raw = text; }
        const obj = JSON.parse(raw);
        setData(obj);
      } catch { alert("Import failed. Check password and file."); }
    };
    reader.readAsText(file);
  };

  // --- CSV import ---
  const importCSVFinances = (csvText, target) => {
    const rows = parseCSV(csvText);
    if (!rows.length) return;
    const header = rows[0].map(h => h.trim().toLowerCase());
    const body = rows.slice(1);
    const mapped = body.map(cols => {
      const get = (name) => cols[header.indexOf(name)] || "";
      if (target === "income") {
        return { id: uid(), source: get("source") || get("name"), amount: Number(get("amount") || 0), frequency: (get("frequency")||"monthly").toLowerCase() };
      } else if (target === "expenses") {
        return { id: uid(), name: get("name") || get("category"), amount: Number(get("amount") || 0), frequency: (get("frequency")||"monthly").toLowerCase() };
      } else if (target === "assets") {
        return { id: uid(), name: get("name"), value: Number(get("value") || 0), notes: get("notes") };
      } else if (target === "liabilities") {
        return { id: uid(), name: get("name"), balance: Number(get("balance") || 0), rate: Number(get("rate") || 0), payment: Number(get("payment") || 0), notes: get("notes") };
      }
      return null;
    }).filter(Boolean);
    setData(d => ({ ...d, [target]: [...d[target], ...mapped] }));
  };

   const generatePDF = () => {
     const doc = new jsPDF({ unit: "pt", format: "a4" });
     const title = "Financial Organizer – Report";
     doc.setFontSize(16);
     doc.text(title, 40, 40);

     doc.setFontSize(10);
     doc.text(`Name: ${data.profile.fullName || ""}`, 40, 60);
     doc.text(`Email: ${data.profile.email || ""}`, 40, 75);
     doc.text(`Jurisdiction: ${data.profile.state}`, 40, 90);

     const addTable = (head, rows) => {
       // @ts-ignore
       doc.autoTable({
         head: [head],
         body: rows,
         startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 110,
         styles: { fontSize: 9 },
         headStyles: { fillColor: [240, 240, 240] }
       });
     };

     addTable(
       ["Checklist Item", "Category", "Done"],
       data.checklist.map(i => [i.label, i.cat, i.done ? "Yes" : "No"])
     );

     addTable(
       ["Assets", "Value", "Notes"],
       data.assets.map(a => [a.name, currency(a.value), a.notes || ""])
     );

     addTable(
       ["Liabilities", "Balance", "Rate", "Payment", "Notes"],
       data.liabilities.map(l => [
         l.name,
         currency(l.balance),
         `${num(l.rate)}%`,
         currency(l.payment),
         l.notes || ""
       ])
     );

     addTable(
       ["Income Source", "Amount (Monthly)", "Frequency"],
       data.income.map(r => [
         r.source,
         currency(freqToMonthly(r.amount, r.frequency)),
         r.frequency
       ])
     );

     addTable(
       ["Expense", "Amount (Monthly)", "Frequency"],
       data.expenses.map(e => [
         e.name,
         currency(freqToMonthly(e.amount, e.frequency)),
         e.frequency
       ])
     );

     const y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 30 : 120;
     doc.setFontSize(12);
     doc.text("Summary", 40, y);
     doc.setFontSize(10);
     doc.text(`Net Worth: ${currency(netWorth)}`, 40, y + 18);
     doc.text(`Monthly Income: ${currency(monthlyIncome)}`, 40, y + 34);
     doc.text(`Monthly Expenses: ${currency(monthlyExpenses)}`, 40, y + 50);
     doc.text(`Monthly Cash Flow: ${currency(cashFlow)}`, 40, y + 66);

     const noteY = y + 96;
     doc.setFontSize(9);
     doc.text(
       "This report is for informational purposes only. Consult a qualified professional for advice.",
       40,
       noteY,
       { maxWidth: 520 }
     );

     if (typeof pdfAddDivorce === "function") {
       pdfAddDivorce(doc, data);
     }

     doc.save(`financial-report-${new Date().toISOString().slice(0, 10)}.pdf`);
   };


  // --- scenario helpers ---
  const cloneScenarioAsAltA = () => setData(d => ({ ...d, scenarios: { ...d.scenarios, altA: { ...d.scenarios.base, name: "Alt A" } } }));
  const scenarioSummary = (s) => {
    const incBase = monthlyIncome - (num(data.scenarios.base.alimony) + num(data.scenarios.base.childSupport));
    const incAdj = incBase + num(s.alimony || 0) + num(s.childSupport || 0) + num(s._extraIncomeMo || 0);
    const houseCost = s.keepHouse ? (num(s.mortgagePayment||0) + num(s.propertyTaxMonthly||0) + num(s.insuranceMonthly||0)) : 0;
    const variableExp = data.expenses.reduce((a, e) => a + freqToMonthly(e.amount, e.frequency), 0);
    const varExpAdj = s._expenseReductionPct ? variableExp * (1 - s._expenseReductionPct/100) : variableExp;
    const exp = varExpAdj + houseCost;
    const flow = incAdj - exp;
    const nwBaseAssets = data.assets.reduce((a, b) => a + num(b.value), 0) + (s.keepHouse ? num(s.houseValue||0) - num(s.mortgageBalance||0) : 0);
    const nwDebts = data.liabilities.reduce((a, l) => a + num(l.balance), 0);
    return { income: incAdj, expenses: exp, cashFlow: flow, netWorth: nwBaseAssets - nwDebts };
  };

  const alt = scenarioSummary(data.scenarios.altA);
  const cur = scenarioSummary(data.scenarios.base);
  const tips = useInsights(data, monthlyIncome, monthlyExpenses, cashFlow);

  // --- UI ---
  const TabBtn = ({ id, label }) => (
    <button onClick={()=>setTab(id)} className={`px-4 py-2 text-sm font-medium rounded-md border ${tab===id?"bg-black text-white":"bg-white"}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gray-900 text-white grid place-content-center shadow">FO</div>
          <div className="flex-1">
            <h1 className="font-semibold text-xl">Financial Organizer</h1>
            <p className="text-xs text-gray-500">Private, browser-based organizer. Not legal advice.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} className="px-3 py-2 text-sm border rounded">Undo</button>
            <button onClick={redo} className="px-3 py-2 text-sm border rounded">Redo</button>
            <input placeholder="Export password (optional)" className="w-56 border rounded px-3 py-2 text-sm" type="password" value={exportPassword} onChange={e=>setExportPassword(e.target.value)} />
            <button onClick={exportJSON} className="px-3 py-2 text-sm border rounded">Export</button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e)=>{ if(e.target.files?.[0]) importJSON(e.target.files[0]); e.target.value = ""; }} />
            <button onClick={()=>fileRef.current?.click()} className="px-3 py-2 text-sm border rounded">Import</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <TabBtn id="welcome" label="Welcome" />
          <TabBtn id="start" label="Quick Start" />
          <TabBtn id="results" label="Results" />
          <TabBtn id="checklist" label="Checklist" />
          <TabBtn id="finances" label="Detailed" />
          <TabBtn id="scenarios" label="Scenarios" />          <TabBtn id="divorce" label="Divorce" />

        </div>

        {monthlyExpenses > monthlyIncome && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            Warning: monthly expenses exceed income.
          </div>
        )}

        {tab === "welcome" && (
          <section className="bg-white border rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-semibold">Welcome</h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div>
                <h4 className="font-medium">What this can do for you</h4>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Gather documents with a ready-to-use checklist</li>
                  <li>Track assets, debts, income and expenses in one place</li>
                  <li>Compare scenarios (keep/sell house, support amounts)</li>
                  <li>Create a clean PDF to share with attorneys/mediators</li>
                  <li>Import CSVs fast, export your data anytime</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium">Quick start (2-3 minutes)</h4>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Use <span className="font-medium">Quick Start</span> to enter all your info</li>
                  <li>Check <span className="font-medium">Results</span> to see your financial summary</li>
                  <li>Generate a PDF report to share with others</li>
                </ol>
                <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">Tip: Use the Export/Import buttons in the header to save or move your data. Add a password for light protection.</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setTab("start")} className="px-4 py-2 border rounded">Start Now</button>
              <button onClick={()=>setTab("results")} className="px-4 py-2 border rounded">View Results</button>
            </div>
          </section>
        )}

        {tab === "start" && (
          <section className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold">Personal Information</h3>
              <p className="text-sm text-gray-600">Basic details needed for reports</p>
              <div className="grid md:grid-cols-3 gap-4 mt-3">
                <Field label="Full Name"><input className="w-full border rounded px-3 py-2" value={data.profile.fullName} onChange={e=>setData(d=>({...d, profile:{...d.profile, fullName:e.target.value}}))} placeholder="Your full name"/></Field>
                <Field label="Email"><input className="w-full border rounded px-3 py-2" value={data.profile.email} onChange={e=>setData(d=>({...d, profile:{...d.profile, email:e.target.value}}))} placeholder="your@email.com"/></Field>
                <Field label="State">
                  <select className="w-full border rounded px-3 py-2" value={data.profile.state} onChange={e=>setData(d=>({...d, profile:{...d.profile, state:e.target.value}}))}>
                    {US_STATES.map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <label className="flex items-start gap-2 p-3 bg-blue-50 rounded mt-3 text-sm">
                <input type="checkbox" checked={data.profile.disclaimerAccepted} onChange={e=>setData(d=>({...d, profile:{...d.profile, disclaimerAccepted:e.target.checked}}))} />
                <span><strong>Disclaimer:</strong> I understand this tool provides general information only and is not legal, tax, or financial advice.</span>
              </label>
            </Card>

            <EditTable
              title="Assets (What you own)"
              cols={["name","value","notes"]}
              rows={data.assets}
              render={(r)=> (
                <>
                  <Cell><input className="w-full border rounded px-2 py-1" placeholder="e.g., Primary residence" value={r.name||""} onChange={e=>updateRow("assets",r.id,{name:e.target.value})}/></Cell>
                  <Cell><input type="number" className={numClass(r.value||0)} value={r.value||0} onChange={e=>updateRow("assets",r.id,{value:Number(e.target.value)})}/></Cell>
                  <Cell><input className="w-full border rounded px-2 py-1" value={r.notes||""} onChange={e=>updateRow("assets",r.id,{notes:e.target.value})}/></Cell>
                </>
              )}
              onAdd={()=>addRow("assets",{name:"", value:0, notes:""})}
              onRemove={(id)=>removeRow("assets",id)}
            />

            <EditTable
              title="Debts (What you owe)"
              cols={["name","balance","rate","payment","notes"]}
              rows={data.liabilities}
              render={(r)=> (
                <>
                  <Cell><input className="w-full border rounded px-2 py-1" placeholder="e.g., Home mortgage" value={r.name||""} onChange={e=>updateRow("liabilities",r.id,{name:e.target.value})}/></Cell>
                  <Cell><input type="number" className={numClass(r.balance||0)} value={r.balance||0} onChange={e=>updateRow("liabilities",r.id,{balance:Number(e.target.value)})}/></Cell>
                  <Cell><input type="number" className={numClass(r.rate||0)} value={r.rate||0} onChange={e=>updateRow("liabilities",r.id,{rate:Number(e.target.value)})}/></Cell>
                  <Cell><input type="number" className={numClass(r.payment||0)} value={r.payment||0} onChange={e=>updateRow("liabilities",r.id,{payment:Number(e.target.value)})}/></Cell>
                  <Cell><input className="w-full border rounded px-2 py-1" value={r.notes||""} onChange={e=>updateRow("liabilities",r.id,{notes:e.target.value})}/></Cell>
                </>
              )}
              onAdd={()=>addRow("liabilities",{name:"", balance:0, rate:0, payment:0, notes:""})}
              onRemove={(id)=>removeRow("liabilities",id)}
            />

            <EditTable
              title="Income (What you earn)"
              cols={["source","amount","frequency"]}
              rows={data.income}
              render={(r)=> (
                <>
                  <Cell><input className="w-full border rounded px-2 py-1" placeholder="e.g., Salary" value={r.source||""} onChange={e=>updateRow("income",r.id,{source:e.target.value})}/></Cell>
                  <Cell><input type="number" className={numClass(r.amount||0)} value={r.amount||0} onChange={e=>updateRow("income",r.id,{amount:Number(e.target.value)})}/></Cell>
                  <Cell>
                    <select className="w-full border rounded px-2 py-1" value={r.frequency||"monthly"} onChange={e=>updateRow("income",r.id,{frequency:e.target.value})}>
                      {['weekly','biweekly','monthly','annual'].map(f=> <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Cell>
                </>
              )}
              onAdd={()=>addRow("income",{source:"", amount:0, frequency:"monthly"})}
              onRemove={(id)=>removeRow("income",id)}
            />
            <div className="flex gap-2 mt-2">
              <input id="quick-add-inc" className="border rounded px-2 py-1 text-sm" placeholder="e.g., freelance 600 biweekly" />
              <button className="px-3 py-2 border rounded" onClick={()=>{
                const v = document.getElementById('quick-add-inc').value;
                const parsed = parseQuickLine(v||"");
                if (parsed) { addRow("income", { source: parsed.name, amount: parsed.amount, frequency: parsed.frequency }); }
                document.getElementById('quick-add-inc').value = "";
              }}>Quick Add</button>
            </div>

            <EditTable
              title="Expenses (What you spend)"
              cols={["name","amount","frequency"]}
              rows={data.expenses}
              render={(r)=> (
                <>
                  <Cell><input className="w-full border rounded px-2 py-1" placeholder="e.g., Rent, Utilities" value={r.name||""} onChange={e=>updateRow("expenses",r.id,{name:e.target.value})}/></Cell>
                  <Cell><input type="number" className={numClass(r.amount||0)} value={r.amount||0} onChange={e=>updateRow("expenses",r.id,{amount:Number(e.target.value)})}/></Cell>
                  <Cell>
                    <select className="w-full border rounded px-2 py-1" value={r.frequency||"monthly"} onChange={e=>updateRow("expenses",r.id,{frequency:e.target.value})}>
                      {['weekly','biweekly','monthly','annual'].map(f=> <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Cell>
                </>
              )}
              onAdd={()=>addRow("expenses",{name:"", amount:0, frequency:"monthly"})}
              onRemove={(id)=>removeRow("expenses",id)}
            />
            <div className="flex gap-2 mt-2">
              <input id="quick-add-exp" className="border rounded px-2 py-1 text-sm" placeholder="e.g., rent 1200 monthly" />
              <button className="px-3 py-2 border rounded" onClick={()=>{
                const v = document.getElementById('quick-add-exp').value;
                const parsed = parseQuickLine(v||"");
                if (parsed) { addRow("expenses", { name: parsed.name, amount: parsed.amount, frequency: parsed.frequency }); }
                document.getElementById('quick-add-exp').value = "";
              }}>Quick Add</button>
            </div>

            <Card>
              <h3 className="text-lg font-semibold">Quick Import (CSV)</h3>
              <div className="grid md:grid-cols-3 gap-3 items-end mt-3">
                <Field label="Target">
                  <select className="w-full border rounded px-2 py-1" id="csv-target">
                    {['income','expenses','assets','liabilities'].map(t=> <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Paste CSV (or upload a .csv file)">
                    <textarea ref={csvRef} rows={4} className="w-full border rounded px-2 py-1" placeholder="name/source, amount, frequency ..."></textarea>
                  </Field>
                  <div className="flex gap-2 mt-2">
                    <button className="px-3 py-2 border rounded" onClick={()=>{
                      const target = document.getElementById('csv-target')?.value || 'income';
                      if (csvRef.current) { importCSVFinances(csvRef.current.value, target); csvRef.current.value = ""; }
                    }}>Import from Text</button>
                    <input type="file" accept=".csv,text/csv" className="hidden" id="csv-file-input" onChange={(e)=>{ if(!e.target.files?.[0]) return; const fr = new FileReader(); fr.onload=()=>{ const target = document.getElementById('csv-target')?.value || 'income'; importCSVFinances(fr.result, target); }; fr.readAsText(e.target.files[0]); e.target.value=""; }} />
                    <button className="px-3 py-2 border rounded" onClick={()=>document.getElementById('csv-file-input').click()}>Upload CSV</button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">CSV headers: income/expenses: <code>name/source, amount, frequency</code>. Assets/Liabilities: <code>name, value|balance, rate, payment, notes</code>.</p>
            </Card>

            <Card className="bg-gradient-to-r from-green-50 to-blue-50">
              <div className="p-4 text-center">
                <h3 className="text-lg font-semibold text-green-800 mb-1">Great! You've entered your basic financial information.</h3>
                <p className="text-sm text-gray-600 mb-2">Now click "View Results" to see your financial summary and get insights.</p>
                <button onClick={()=>setTab("results")} className="px-4 py-2 border rounded">View Results</button>
              </div>
            </Card>
          </section>
        )}

        {tab === "results" && (
          <section className="space-y-6">
            <Card className="bg-gradient-to-r from-blue-50 to-green-50">
              <div className="p-4">
                <h3 className="text-xl text-center">Financial Summary</h3>
                <div className="grid md:grid-cols-4 gap-4 mt-4">
                  <Stat label="Net Worth" value={currency(netWorth)} />
                  <Stat label="Monthly Income" value={currency(monthlyIncome)} />
                  <Stat label="Monthly Expenses" value={currency(monthlyExpenses)} />
                  <Stat label="Cash Flow" value={currency(cashFlow)} positive={cashFlow>=0} />
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <Card><div className="p-4"><h4 className="font-medium mb-2">Total Assets</h4>{data.assets.length? data.assets.map(a=> <Row key={a.id} k={a.name||'Unnamed'} v={currency(a.value)} />): <p className="text-sm text-gray-500">No assets entered yet</p>}<Divider/><Row k="Total" v={currency(data.assets.reduce((s,a)=>s+num(a.value),0))} bold/></div></Card>
                  <Card><div className="p-4"><h4 className="font-medium mb-2">Total Debts</h4>{data.liabilities.length? data.liabilities.map(l=> <Row key={l.id} k={l.name||'Unnamed'} v={currency(l.balance)} danger/>): <p className="text-sm text-gray-500">No debts entered</p>}<Divider/><Row k="Total" v={currency(data.liabilities.reduce((s,l)=>s+num(l.balance),0))} bold danger/></div></Card>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <Card><div className="p-4"><h4 className="font-medium mb-2">Income Sources</h4>{data.income.length? data.income.map(i=> <Row key={i.id} k={i.source||'Unnamed'} v={`${currency(freqToMonthly(i.amount,i.frequency))}/mo`} />): <p className="text-sm text-gray-500">No income entered yet</p>}<Divider/><Row k="Total Monthly" v={currency(monthlyIncome)} bold/></div></Card>
                  <Card><div className="p-4"><h4 className="font-medium mb-2">Monthly Expenses</h4>{data.expenses.length? data.expenses.map(e=> <Row key={e.id} k={e.name||'Unnamed'} v={`${currency(freqToMonthly(e.amount,e.frequency))}/mo`} />): <p className="text-sm text-gray-500">No expenses entered yet</p>}<Divider/><Row k="Total Monthly" v={currency(monthlyExpenses)} bold/></div></Card>
                </div>
              </div>
            </Card>

            <div className="flex justify-center gap-3">
              <button onClick={generatePDF} className="px-4 py-2 border rounded">Generate PDF Report</button>
              <button onClick={()=>setTab("start")} className="px-4 py-2 border rounded">Edit Information</button>
            </div>
          </section>
        )}

        {tab === "checklist" && (
          <section className="bg-white border rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-2">Document Checklist</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {data.checklist.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 border rounded-xl">
                  <input type="checkbox" checked={item.done} onChange={e=>setData(d=>({...d, checklist: d.checklist.map(i=>i.id===item.id?{...i, done:e.target.checked}:i)}))} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.label}</div>
                    <div className="text-xs text-gray-500">{item.cat}</div>
                  </div>
                  <button className="text-sm px-2 py-1" onClick={()=>setData(d=>({...d, checklist: d.checklist.filter(i=>i.id!==item.id)}))}>Remove</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col md:flex-row gap-2 items-end">
              <Field label="Item" className="flex-1"><input id="ck-label" className="w-full border rounded px-2 py-1" placeholder="e.g., Last 6 months of utility bills"/></Field>
              <Field label="Category">
                <select id="ck-cat" className="w-48 border rounded px-2 py-1">
                  {Array.from(new Set(["Income","Assets","Debts","Expenses","Business","Legal","Other"]))
                    .map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <button className="px-3 py-2 border rounded" onClick={()=>{
                const label = document.getElementById('ck-label').value.trim();
                const cat = document.getElementById('ck-cat').value;
                if (label) setData(d=>({...d, checklist:[...d.checklist,{id:uid(), label, cat, done:false}]}));
                document.getElementById('ck-label').value = "";
              }}>Add</button>
            </div>
          </section>
        )}

        {tab === "finances" && (
          <section className="space-y-4">
            <ScenarioHouseCard title="Home / Housing (affects expenses & net worth)" s={data.scenarios.base} onChange={(patch)=>setData(d=>({...d, scenarios:{...d.scenarios, base:{...d.scenarios.base, ...patch}}}))} />
          </section>
        )}

        {tab === "scenarios" && (
          <section className="space-y-4">
            {tips.length > 0 && (
              <Card>
                <div className="p-4 space-y-2">
                  <h4 className="font-medium">Insights</h4>
                  {tips.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span>{t.text}</span>
                      {t.action?.type === "applyTrim10" && (
                        <button className="px-2 py-1 border rounded" onClick={() => setData(d => ({ ...d, scenarios: { ...d.scenarios, altA: { ...d.scenarios.altA, _expenseReductionPct: 10 } } }))}>Apply to Alt A</button>
                      )}
                      {t.action?.type === "applyRefi" && (
                        <button className="px-2 py-1 border rounded" onClick={() => setData(d => ({ ...d, scenarios: { ...d.scenarios, altA: { ...d.scenarios.base, name: "Refi", mortgagePayment: Math.round((d.scenarios.base.mortgagePayment||0)*0.85) } } }))}>Create Refi Alt</button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <ScenarioCard title="Current" s={data.scenarios.base} onChange={(patch)=>setData(d=>({...d, scenarios:{...d.scenarios, base:{...d.scenarios.base, ...patch}}}))} summary={cur} />
              <ScenarioCard title={data.scenarios.altA.name} s={data.scenarios.altA} onChange={(patch)=>setData(d=>({...d, scenarios:{...d.scenarios, altA:{...d.scenarios.altA, ...patch}}}))} summary={alt} tools={<><button className="px-3 py-2 border rounded" onClick={cloneScenarioAsAltA}>Clone from Current</button><button className="px-3 py-2 border rounded" onClick={()=>{const alts = autoBuildScenarios(data.scenarios.base); setData(d=>({ ...d, scenarios:{...d.scenarios, altA:{...d.scenarios.altA, ...alts[0]}}}));}}>Build Suggestions</button></>} />
            </div>
            <Card>
              <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <h4 className="font-medium">Current</h4>
                  <Row k="Net Worth" v={currency(cur.netWorth)} />
                  <Row k="Monthly Income" v={currency(cur.income)} />
                  <Row k="Monthly Expenses" v={currency(cur.expenses)} />
                  <Row k="Cash Flow" v={currency(cur.cashFlow)} color={cur.cashFlow>=0?"text-green-700":"text-red-700"} />
                </div>
                <div>
                  <h4 className="font-medium">{data.scenarios.altA.name}</h4>
                  <Row k="Net Worth" v={currency(alt.netWorth)} />
                  <Row k="Monthly Income" v={currency(alt.income)} />
                  <Row k="Monthly Expenses" v={currency(alt.expenses)} />
                  <Row k="Cash Flow" v={currency(alt.cashFlow)} color={alt.cashFlow>=0?"text-green-700":"text-red-700"} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <h4 className="font-medium mb-2">Notes</h4>
                <textarea rows={6} className="w-full border rounded px-3 py-2 text-sm" value={data.notes} onChange={(e)=>setData(d=>({...d, notes:e.target.value}))} placeholder="Write any assumptions or details for your scenarios here." />
              </div>
            </Card>
          </section>
        )}

        {tab === "divorce" && (
          <section className="bg-white border rounded-xl p-6 space-y-4">
            <DivorceTab
              data={data.divorce}
              setDivorce={(next) => setData(d => ({ ...d, divorce: next }))}
            />
            <div className="flex gap-2">
              <button className="px-3 py-2 border rounded" onClick={()=>{
                const filingISO = (data.divorce?.support?.startDateISO) || new Date().toISOString().slice(0,10);
                const hasKids = typeof data.divorce?.children === "number" && data.divorce.children > 0;
                const contested = (data.divorce?.caseType || "").toLowerCase().includes("contested");
                const deadlines = computeDivorceDeadlines(filingISO, contested, hasKids);
                setData(d => ({ ...d, divorce: { ...(d.divorce||{}), deadlines }}));
              }}>Build Deadlines</button>

              <button className="px-3 py-2 border rounded" onClick={()=>{
                const hasKids = typeof data.divorce?.children === "number" && data.divorce.children > 0;
                const disclosures = defaultDisclosures(hasKids);
                setData(d => ({ ...d, divorce: { ...(d.divorce||{}), disclosures }}));
              }}>Build Disclosures</button>
            </div>
          </section>
        )}
{tab === "settings" && (
          <section className="bg-white border rounded-xl p-4 space-y-4 text-sm">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Export password (optional)"><input type="password" className="w-full border rounded px-2 py-1" value={exportPassword} onChange={(e)=>setExportPassword(e.target.value)} placeholder="Set before exporting"/></Field>
              <Field label="Import password (if file was protected)"><input type="password" className="w-full border rounded px-2 py-1" value={importPassword} onChange={(e)=>setImportPassword(e.target.value)} placeholder="Enter before importing"/></Field>
            </div>
            <Divider/>
            <DangerZone setData={setData} />
          </section>
        )}

        <footer className="py-8 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Financial Organizer. This software provides general information only and is not legal, tax, or financial advice. Laws vary by jurisdiction. Consult a qualified professional.</p>
        </footer>
      </main>
    </div>
  );
}

// --- small UI helpers ---
function Card({ children, className="", ...rest }) { return <div className={`bg-white border rounded-xl ${className}`} {...rest}>{children}</div>; }
function Field({ label, children, className }) { return <div className={className||""}><label className="block text-sm text-gray-700 mb-1">{label}</label>{children}</div>; }
function Divider(){ return <div className="h-px bg-gray-200 my-3"/>; }
function Row({ k, v, bold, danger, color }){ return <div className={`flex items-center justify-between py-1 ${bold?"font-semibold":""}`}><span>{k}</span><span className={`${danger?"text-red-600":""} ${color||""}`}>{v}</span></div>; }
function Stat({ label, value, positive }) { return (<div className="p-4 rounded-2xl bg-white border shadow-sm"><div className="text-xs text-gray-500">{label}</div><div className={`text-lg font-semibold ${positive===true?"text-green-700":positive===false?"text-red-700":""}`}>{value}</div></div>); }
function Cell({ children }){ return <td className="py-2 pr-3 align-top">{children}</td>; }

function EditTable({ title, cols, rows, render, onAdd, onRemove }) {
  return (
    <Card>
      <div className="p-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button className="px-3 py-2 border rounded" onClick={onAdd}>Add</button></div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              {cols.map((c,i)=>(<th key={i} className="py-2 pr-4 font-medium capitalize">{c}</th>))}
              <th className="py-2 pr-2"/>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                {render(r)}
                <td className="py-2 pr-2 text-right"><button className="px-2 py-1" onClick={()=>onRemove(r.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScenarioHouseCard({ title, s, onChange }){
  return (
    <Card>
      <div className="p-4 space-y-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <Field label="Keep House?">
            <select className="w-full border rounded px-2 py-1" value={String(!!s.keepHouse)} onChange={(e)=>onChange({keepHouse: e.target.value === 'true'})}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="House Value"><input type="number" className={numClass(s.houseValue||0)} value={s.houseValue||0} onChange={(e)=>onChange({houseValue:Number(e.target.value)})}/></Field>
          <Field label="Mortgage Balance"><input type="number" className={numClass(s.mortgageBalance||0)} value={s.mortgageBalance||0} onChange={(e)=>onChange({mortgageBalance:Number(e.target.value)})}/></Field>
          <Field label="Mortgage Payment (mo)"><input type="number" className={numClass(s.mortgagePayment||0)} value={s.mortgagePayment||0} onChange={(e)=>onChange({mortgagePayment:Number(e.target.value)})}/></Field>
          <Field label="Property Tax (mo)"><input type="number" className={numClass(s.propertyTaxMonthly||0)} value={s.propertyTaxMonthly||0} onChange={(e)=>onChange({propertyTaxMonthly:Number(e.target.value)})}/></Field>
          <Field label="Insurance (mo)"><input type="number" className={numClass(s.insuranceMonthly||0)} value={s.insuranceMonthly||0} onChange={(e)=>onChange({insuranceMonthly:Number(e.target.value)})}/></Field>
        </div>
      </div>
    </Card>
  );
}

function ScenarioCard({ title, s, onChange, summary, tools }){
  return (
    <Card>
      <div className="p-4 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><div className="flex gap-2">{tools}</div></div>
      <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
        <div className="space-y-2">
          <Field label="Alimony / Spousal Support (monthly)">
            <input type="range" min="0" max="5000" step="50" value={s.alimony||0} onChange={(e)=>onChange({alimony:Number(e.target.value)})} />
            <input type="number" className={numClass(s.alimony||0)} value={s.alimony||0} onChange={(e)=>onChange({alimony:Number(e.target.value)})}/>
          </Field>
          <Field label="Child Support (monthly)">
            <input type="range" min="0" max="5000" step="50" value={s.childSupport||0} onChange={(e)=>onChange({childSupport:Number(e.target.value)})} />
            <input type="number" className={numClass(s.childSupport||0)} value={s.childSupport||0} onChange={(e)=>onChange({childSupport:Number(e.target.value)})}/>
          </Field>
          <Field label="Keep House?">
            <select className="w-full border rounded px-2 py-1" value={String(!!s.keepHouse)} onChange={(e)=>onChange({keepHouse: e.target.value === 'true'})}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
        </div>
        <div className="space-y-2">
          <Field label="House Value"><input type="number" className={numClass(s.houseValue||0)} value={s.houseValue||0} onChange={(e)=>onChange({houseValue:Number(e.target.value)})}/></Field>
          <Field label="Mortgage Balance"><input type="number" className={numClass(s.mortgageBalance||0)} value={s.mortgageBalance||0} onChange={(e)=>onChange({mortgageBalance:Number(e.target.value)})}/></Field>
          <Field label="Mortgage Payment (mo)"><input type="number" className={numClass(s.mortgagePayment||0)} value={s.mortgagePayment||0} onChange={(e)=>onChange({mortgagePayment:Number(e.target.value)})}/></Field>
          <Field label="Property Tax (mo)"><input type="number" className={numClass(s.propertyTaxMonthly||0)} value={s.propertyTaxMonthly||0} onChange={(e)=>onChange({propertyTaxMonthly:Number(e.target.value)})}/></Field>
          <Field label="Insurance (mo)"><input type="number" className={numClass(s.insuranceMonthly||0)} value={s.insuranceMonthly||0} onChange={(e)=>onChange({insuranceMonthly:Number(e.target.value)})}/></Field>
        </div>
      </div>
      <Divider/>
      <div className="p-4 grid grid-cols-2 gap-3 text-sm">
        <Row k="Net Worth" v={currency(summary.netWorth)} />
        <Row k="Monthly Income" v={currency(summary.income)} />
        <Row k="Monthly Expenses" v={currency(summary.expenses)} />
        <Row k="Cash Flow" v={currency(summary.cashFlow)} color={summary.cashFlow>=0?"text-green-700":"text-red-700"} />
      </div>
    </Card>
  );
}

function DangerZone({ setData }) {
  return (
    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
      <div className="font-semibold mb-2 text-red-700">Danger Zone</div>
      <div className="flex flex-wrap gap-2">
        <button className="px-3 py-2 border rounded" onClick={()=>{ if (confirm('Clear all local data?')) setData(defaultState); }}>Reset to defaults</button>
        <button className="px-3 py-2 border rounded" onClick={()=>{ if (confirm('Erase all local data?')) localStorage.removeItem(STORAGE_KEY); }}>Erase localStorage</button>
      </div>
      <p className="text-xs text-gray-600 mt-2">Your data is saved to your browser's localStorage. No server or account is required. For sensitive info, export and store securely.</p>
    </div>
  );
}

   function pdfAddDivorce(doc, data) {
     if (!data || !data.divorce) return;
     var d = data.divorce;

     doc.addPage();
     doc.setFontSize(16);
     doc.text("Divorce Summary", 40, 40);

     doc.setFontSize(10);
     doc.text("Case type: " + (d.caseType || "-"), 40, 60);
     doc.text("Filing state: " + (d.filingState || "-"), 40, 75);
     var childCount = (typeof d.children === "number" ? d.children : "-");
     doc.text("Children: " + childCount, 40, 90);

     var contacts = (d.attorneyContacts || []).map(function (c) {
       return [c.name || "", c.role || "", c.email || "", c.phone || ""];
     });
     if (contacts.length) {
       // @ts-ignore
       doc.autoTable({
         head: [["Name", "Role", "Email", "Phone"]],
         body: contacts,
         startY: 110,
         styles: { fontSize: 9 }
       });
     }
     var startY1 = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? (doc.lastAutoTable.finalY + 8) : 110;

     var deadlines = (d.deadlines || []).map(function (x) {
       return [x.label || "", x.dateISO || "", x.done ? "Yes" : "No"];
     });
     // @ts-ignore
     doc.autoTable({
       head: [["Deadline", "Date", "Done"]],
       body: deadlines,
       startY: startY1,
       styles: { fontSize: 9 }
     });
     var startY2 = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? (doc.lastAutoTable.finalY + 8) : startY1;

     var disclosures = (d.disclosures || []).map(function (x) {
       return [x.label || "", x.provided ? "Yes" : "No"];
     });
     // @ts-ignore
     doc.autoTable({
       head: [["Disclosure", "Provided"]],
       body: disclosures,
       startY: startY2,
       styles: { fontSize: 9 }
     });
     var startY3 = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? (doc.lastAutoTable.finalY + 8) : startY2;

     var a = (d.support && typeof d.support.requestedAlimonyMonthly === "number") ? d.support.requestedAlimonyMonthly : 0;
     var c = (d.support && typeof d.support.requestedChildSupportMonthly === "number") ? d.support.requestedChildSupportMonthly : 0;
     var s = (d.support && d.support.startDateISO) ? d.support.startDateISO : "-";
     // @ts-ignore
     doc.autoTable({
       head: [["Requested Alimony (mo)", "Requested Child Support (mo)", "Start Date"]],
       body: [[String(a || 0), String(c || 0), s]],
       startY: startY3,
       styles: { fontSize: 9 }
     });

     doc.setFontSize(8);
     var noteY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? (doc.lastAutoTable.finalY + 8) : (startY3 + 8);
     doc.text("Informational only - not legal advice.", 14, noteY);
   }



