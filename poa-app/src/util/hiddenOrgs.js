// Test / internal orgs hidden from every public listing (explore directory,
// landing page registry). Matched against the org display name (`po.id`
// after the profileHub transform). Single source of truth — do not inline
// copies of this list.
export const HIDDEN_ORG_IDS = ["tkrjehbcuebc", "Test3", "Test2", "Test", "Test5", "Test6"];

export const isHiddenOrg = (name) => HIDDEN_ORG_IDS.includes(name);
