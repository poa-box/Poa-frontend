/**
 * Build an org-scoped URL.
 * @param {string} orgName - Organization name
 * @param {string} page - Page path (e.g. 'tasks', 'voting', 'profile')
 * @param {Object} [params] - Additional query params (e.g. { task: '123' })
 * @returns {string} URL string like '/tasks/?org=MyOrg&task=123'
 */
export function orgUrl(orgName, page = 'home', params = {}) {
  const query = new URLSearchParams({ org: orgName, ...params });
  return `/${page}/?${query.toString()}`;
}
