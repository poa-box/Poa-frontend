import { requireEmailProofProjection } from '@poa-box/core/email/proof';

const projections = new WeakMap();

/** Keep representation-only proof provenance through the existing proof-object API. */
export function retainEmailProofProjection(projection) {
  projections.set(projection.proof, projection);
  return projection.proof;
}

export function emailProofProjection(proof, version, claimer) {
  const projection = projections.get(proof);
  if (!projection) throw new Error('Prepare the email proof again before claiming this invite.');
  requireEmailProofProjection(projection, version, claimer);
  return projection;
}
