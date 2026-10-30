import React from 'react';
import { RoleCardContainer, RoleCardFields } from '@/features/deployer/components/role/RoleCardShared';
import NativeMembershipFields from '@/features/deployer/components/role/NativeMembershipFields';

export function RoleCardSimple(props) {
  return <RoleCardContainer><RoleCardFields {...props}
    joinMethod={<NativeMembershipFields role={props.role} roles={props.roles}
      onChange={role => props.onUpdate(props.roleIndex, role)} />} />
  </RoleCardContainer>;
}
export default RoleCardSimple;
