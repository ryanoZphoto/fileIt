// Shared helpers for divorce workflows: deadlines, disclosures, and guided steps

export function computeDivorceDeadlines(filingISO, contested, hasKids, rules) {
  const base = filingISO ? new Date(filingISO) : new Date();
  const addDays = (n) => new Date(base.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const r = {
    financialDisclosureDays: 30,
    initialExchangeDays: 45,
    parentingPlanDays: 20,
    mediationDays: 60,
    ...(rules || {})
  };
  const items = [
    { label: "Financial disclosure due", dateISO: addDays(r.financialDisclosureDays), done: false },
    { label: "Initial disclosures exchange", dateISO: addDays(r.initialExchangeDays), done: false },
    { label: "Parenting plan draft", dateISO: addDays(hasKids ? r.parentingPlanDays : 0), done: !hasKids }
  ];
  if (contested) items.push({ label: "Mediation/settlement conference", dateISO: addDays(r.mediationDays), done: false });
  return items;
}

export function defaultDisclosures(hasKids) {
  const x = [
    { label: "Income documentation (pay stubs / 1099s)", provided: false, notes: "" },
    { label: "Tax returns (3 years)", provided: false, notes: "" },
    { label: "Bank statements (12 months)", provided: false, notes: "" },
    { label: "Retirement/investment statements (12 months)", provided: false, notes: "" },
    { label: "Debt statements (12 months)", provided: false, notes: "" }
  ];
  if (hasKids) x.push({ label: "Childcare/education expenses", provided: false, notes: "" });
  return x;
}

export const DIVORCE_GUIDED_STEPS = [
  { id: "basics", title: "Enter basics", description: "Case type, state, and children" },
  { id: "deadlines", title: "Build deadlines", description: "Auto-generate key deadlines" },
  { id: "disclosures", title: "Build disclosures", description: "Create initial disclosure checklist" },
  { id: "checkoff", title: "Check off items", description: "Mark disclosures as provided" },
];


