import { describe, expect, it, vi } from 'vitest';
import { print } from 'graphql';
import { fetchLatestRejectedSubmission } from './taskSubmissionHistory';

const TASK_ID = '0xf57024fc77915fce8f2608afdd027941bcee3336-19';
const SUBMISSION_HASH = `0x${'12'.repeat(32)}`;

describe('fetchLatestRejectedSubmission', () => {
  it('returns submission content indexed by the subgraph', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        data: {
          task: {
            latestRejection: {
              submission: {
                submissionHash: SUBMISSION_HASH,
                metadata: { submission: 'Indexed submitted work' },
              },
            },
          },
        },
      }),
    };
    const fetchFromIpfs = vi.fn();

    await expect(fetchLatestRejectedSubmission({
      client,
      taskId: TASK_ID,
      fetchFromIpfs,
    })).resolves.toBe('Indexed submitted work');

    expect(client.query).toHaveBeenCalledWith(expect.objectContaining({
      variables: { taskId: TASK_ID },
      fetchPolicy: 'network-only',
    }));
    expect(fetchFromIpfs).not.toHaveBeenCalled();
  });

  it('hydrates the indexed hash from IPFS while file metadata is pending', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        data: {
          task: {
            latestRejection: {
              submission: {
                submissionHash: SUBMISSION_HASH,
                metadata: null,
              },
            },
          },
        },
      }),
    };
    const fetchFromIpfs = vi.fn().mockResolvedValue({ submission: 'IPFS submitted work' });

    await expect(fetchLatestRejectedSubmission({
      client,
      taskId: TASK_ID,
      fetchFromIpfs,
    })).resolves.toBe('IPFS submitted work');
    expect(fetchFromIpfs).toHaveBeenCalledWith(SUBMISSION_HASH);
  });

  it('returns null when the latest rejection has no linked submission', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        data: { task: { latestRejection: { submission: null } } },
      }),
    };
    const fetchFromIpfs = vi.fn();

    await expect(fetchLatestRejectedSubmission({
      client,
      taskId: TASK_ID,
      fetchFromIpfs,
    })).resolves.toBeNull();
    expect(fetchFromIpfs).not.toHaveBeenCalled();
  });
});


  it('uses the core-linked immutable selection without unrelated history reads', async () => {
    const client = { query: vi.fn().mockResolvedValue({ data: { task: null } }) };
    await fetchLatestRejectedSubmission({ client, taskId: TASK_ID });
    const document = print(client.query.mock.calls[0][0].query);
    expect(document).toContain('latestRejection');
    expect(document).toContain('submissionHash');
    expect(document).not.toContain('rejectionCursor');
    expect(document).not.toContain('latestSubmission');
  });

  it('retains known empty submission and propagates query failures', async () => {
    const fetchFromIpfs = vi.fn();
    const client = { query: vi.fn().mockResolvedValue({ data: { task: {
      latestRejection: { submission: { metadata: { submission: '' }, submissionHash: SUBMISSION_HASH } },
    } } }) };
    await expect(fetchLatestRejectedSubmission({ client, taskId: TASK_ID, fetchFromIpfs })).resolves.toBe('');
    expect(fetchFromIpfs).not.toHaveBeenCalled();
    const error = new Error('mock endpoint outage');
    client.query.mockRejectedValueOnce(error);
    await expect(fetchLatestRejectedSubmission({ client, taskId: TASK_ID })).rejects.toBe(error);
  });
