const CONTENT_SERVICES = ['voting', 'task', 'education', 'tokenRequest'];

/** Preserve the storage override without rebuilding unrelated/read services. */
export function selectServiceOptions(services, defaultIpfs, options, createContentService) {
  const ipfs = options.ipfsService || defaultIpfs;
  if (ipfs === defaultIpfs || !services.task) return services;
  return {
    ...services,
    ...Object.fromEntries(CONTENT_SERVICES.map((name) => [name, createContentService(name, ipfs)])),
  };
}
