export const divorceDefaults = (profileState) => ({
  caseType: "dissolution",
  children: 0,
  filingState: (profileState && profileState.state) || "",
  attorneyContacts: [],
  deadlines: [],
  disclosures: [],
  support: {},
  wizardStep: "basics"
});

export function ensureDivorceDefaults(state) {
  const next = { ...(state || {}) };
  if (!next.divorce) {
    next.divorce = divorceDefaults(next.profile || {});
  } else {
    const d = next.divorce;
    next.divorce = {
      ...divorceDefaults(next.profile || {}),
      ...d,
      support: { ...(divorceDefaults(next.profile || {}).support), ...(d.support || {}) },
      attorneyContacts: Array.isArray(d.attorneyContacts) ? d.attorneyContacts : [],
      deadlines: Array.isArray(d.deadlines) ? d.deadlines : [],
      disclosures: Array.isArray(d.disclosures) ? d.disclosures : []
    };
  }
  return next;
}
