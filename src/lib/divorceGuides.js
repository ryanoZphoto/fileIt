// Shared helpers for divorce workflows: deadlines, disclosures, and guided steps

export function computeDivorceDeadlines(filingISO, contested, hasKids) {
  const base = filingISO ? new Date(filingISO) : new Date();
  const addDays = (n) => new Date(base.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const items = [
    { label: "Financial disclosure due", dateISO: addDays(30), done: false },
    { label: "Initial disclosures exchange", dateISO: addDays(45), done: false },
    { label: "Parenting plan draft", dateISO: addDays(hasKids ? 20 : 0), done: !hasKids }
  ];
  if (contested) items.push({ label: "Mediation/settlement conference", dateISO: addDays(60), done: false });
  return items;
}

export function defaultDisclosures(hasKids) {
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

export const DIVORCE_GUIDED_STEPS = [
  { id: "basics", title: "Enter basics", description: "Case type, state, and children" },
  { id: "deadlines", title: "Build deadlines", description: "Auto-generate key deadlines" },
  { id: "disclosures", title: "Build disclosures", description: "Create initial disclosure checklist" },
  { id: "checkoff", title: "Check off items", description: "Mark disclosures as provided" },
];


