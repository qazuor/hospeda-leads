import { describe, expect, it } from 'vitest';
import { businessStatuses, businessStatusLabels, isReviewedBusinessStatus } from './businessStatus';

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

describe('businessStatusLabels', () => {
  it('labels the stored no_follow_up_scheduled value as "Sin tarea agendada" (decision 6c)', () => {
    expect(businessStatusLabels.no_follow_up_scheduled).toBe('Sin tarea agendada');
    expect(businessStatuses).toContain('no_follow_up_scheduled');
  });
});
