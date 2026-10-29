import { describe, expect, it } from 'vitest';
import { createTaskMetadata, editTaskMetadata } from '@/lib/tasks/metadata';

const base = { name: 'Existing', description: 'Care', location: 'Remote', difficulty: 'hard', estHours: '0.25',
  submission: 'Saved work', dueDate: 2100000000, attachment: { cid: 'host field', hidden: false } };

describe('complete metadata host adapter', () => {
  it('keeps unknown fields, submission and zero estimated hours when editing', () => {
    expect(editTaskMetadata({ baseMetadata: base, name: 'Updated', estHours: 0 })).toEqual({ ...base, name: 'Updated', estHours: 0 });
    expect(base.name).toBe('Existing');
  });
  it('supports explicit clearing without dropping untouched fields', () => {
    const document = editTaskMetadata({ baseMetadata: base, submission: '', dueDate: null });
    expect(document.submission).toBe('');
    expect(document).not.toHaveProperty('dueDate');
    expect(document.attachment).toEqual(base.attachment);
    expect(document.description).toBe('Care');
  });
  it('allows an explicitly complete replacement and refuses incomplete bases', () => {
    expect(editTaskMetadata({ ...base, estHours: '0' }).submission).toBe('Saved work');
    expect(() => editTaskMetadata({ name: 'Unsafe blanking' })).toThrow(/saved task details/);
    expect(() => editTaskMetadata({ baseMetadata: { name: 'Partial' }, description: 'New' })).toThrow(/requires/);
  });
  it('retains creation key order and optional date semantics', () => {
    const doc = createTaskMetadata({ name: 'Draft', dueDate: '2100000000', baseMetadata: { attachment: false } });
    expect(Object.keys(doc)).toEqual(['name', 'description', 'location', 'difficulty', 'estHours', 'submission', 'dueDate', 'attachment']);
    expect(doc.dueDate).toBe(2100000000);
    expect(createTaskMetadata({ name: 'Draft' })).not.toHaveProperty('dueDate');
  });
});
