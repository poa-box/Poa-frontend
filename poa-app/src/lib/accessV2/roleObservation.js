/** Compatibility read entry; React/services provide canonical requests and host transports. */
import { createRoleOperationHost, requireRoleOperation } from '@/lib/accessV2/roleOperationHost';

export async function observeRoleConfiguration({ readFactory, ...input }) {
  return requireRoleOperation(await createRoleOperationHost(readFactory).read(input));
}
