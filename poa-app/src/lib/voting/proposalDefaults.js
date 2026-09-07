export const CREATE_ROLE_TITLE_PREFIX = 'Create role: ';
export const CREATE_ROLE_DESCRIPTION_PREFIX = 'New role ';
export const ELECTION_TITLE_PREFIX = 'Election for ';
export const ELECTION_DESCRIPTION_PREFIX = 'Election between ';

export const defaultRoleConfig = {
  parentHatId: '',
  name: '',
  description: '',
  imageURI: '',
  maxSupply: 100,
  mutable: true,
  defaultEligible: true,
  defaultStanding: true,
  canVote: false,
  // ACCESS V2 only: "anyone in the group can join this role" (`setSubjectDefault(allow)`).
  // Deliberately OFF by default and deliberately NOT mapped from `defaultEligible` — the legacy
  // flag reads as "wearers start eligible" while the v2 one makes the role claimable by ANYONE,
  // and quietly upgrading one to the other would open every new role an org creates.
  openRole: false,
  // Task-system grants (all additive — encoder appends nothing when untouched):
  globalPerms: 0,            // org-wide TaskPerm mask via setConfig(ROLE_PERM)
  canCreateTasks: false,     // setConfig(CREATOR_HAT_ALLOWED) — create projects/tasks
  canOrganizeFolders: false, // setConfig(ORGANIZER_HAT_ALLOWED) — reorganize folder tree
  vouching: {
    enabled: false,
    quorum: 1,
    voucherHatId: '',
    selfVouch: false,
    combineWithHierarchy: false,
  },
  initialWearers: [],   // [{ address, name, eligible, standing }]
  projectPerms: [],     // [{ projectId, projectName, mask }]
};
