import type { Generated } from './schema';

declare module './schema' {
  interface CrmAccounts {
    status: Generated<'new' | 'reviewed' | 'in_management' | 'no_follow_up_scheduled' | 'recontact' | 'archived'>;
    recontactAt: Generated<string | null>;
    isClient: Generated<boolean>;
    referredToLeandro: Generated<boolean>;
    referredOriginalOwnerEmail: Generated<string | null>;
  }
  interface Leads {
    managementType: Generated<'main' | 'partner' | 'provider' | 'editor' | 'accompaniment' | null>;
    referredPreviousStage: Generated<string | null>;
    referredPreviousAssigneeEmail: Generated<string | null>;
  }
}
