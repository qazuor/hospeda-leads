import { describe, expect, it } from 'vitest';
import { isReviewedBusinessStatus } from './businessStatus';

describe('isReviewedBusinessStatus', () => {
  it('treats only new or missing status as not reviewed', () => {
    expect(isReviewedBusinessStatus('new')).toBe(false);
    expect(isReviewedBusinessStatus(null)).toBe(false);
    expect(isReviewedBusinessStatus(undefined)).toBe(false);
    expect(isReviewedBusinessStatus('reviewed')).toBe(true);
    expect(isReviewedBusinessStatus('in_management')).toBe(true);
    expect(isReviewedBusinessStatus('no_follow_up_scheduled')).toBe(true);
    expect(isReviewedBusinessStatus('recontact')).toBe(true);
    expect(isReviewedBusinessStatus('archived')).toBe(true);
  });
});
