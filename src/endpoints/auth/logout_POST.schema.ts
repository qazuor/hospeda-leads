import { z } from "zod";
import superjson from "superjson";
import { apiJson } from "../../helpers/apiClient";

// No input required for logout
export const schema = z.object({});

export type OutputType = {
  success: boolean;
  message: string;
};

/** Throws CrmApiError; 401 means the session was already gone. */
export const postLogout = async (
  body: z.infer<typeof schema> = {},
  init?: RequestInit
): Promise<OutputType> => {
  return apiJson<OutputType>(`/_api/auth/logout`, {
    method: "POST",
    body: superjson.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  }, { fallback: "No se pudo cerrar la sesión. Intentá de nuevo.", sessionEvent: false });
};
