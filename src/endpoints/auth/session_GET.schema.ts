import { z } from "zod";
import { User } from "../../helpers/User";
import { apiJson } from "../../helpers/apiClient";

// no schema, just a simple GET request
export const schema = z.object({});

export type OutputType = {
  user: User;
};

/** Throws CrmApiError; status 401 means there is no valid session. No session event: useAuth decides whether a 401 is an expiry or a first visit. */
export const getSession = async (
  body: z.infer<typeof schema> = {},
  init?: RequestInit
): Promise<OutputType> => {
  return apiJson<OutputType>(`/_api/auth/session`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  }, { fallback: "No se pudo verificar la sesión.", sessionEvent: false });
};
