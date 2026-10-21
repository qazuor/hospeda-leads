import superjson from 'superjson';
import {NotAuthenticatedError} from './getSetServerSession';
import {crmError,fallbackStatus} from './crmErrors';
/** JSON error Response for legacy endpoints: 401 when unauthenticated, 500 for unexpected driver/runtime errors via fallbackStatus (generic Spanish message, logged), otherwise the endpoint's own `status` (400 by default; pass 403/409 for forbidden/conflict). */
export function errorResponse(error:unknown,status=400):Response{
 return new Response(superjson.stringify({error:crmError(error)}),{status:error instanceof NotAuthenticatedError?401:status===400?fallbackStatus(error):status});
}
