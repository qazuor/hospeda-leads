import { z } from "zod";
import { User } from "../../helpers/User";
import superjson from "superjson";
import {apiJson} from "../../helpers/apiClient";

export const schema = z.object({
  email: z.string().email("Email is required"),
  password: z.string().min(1, "Password is required"),
});

export type OutputType = {
  user: User;
};

export const postLogin = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  return apiJson<OutputType>(`/_api/auth/login_with_password`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include", // Important for cookies to be sent and received
  }, { fallback: "No se pudo ingresar. Intentá de nuevo.", sessionEvent: false });
};
