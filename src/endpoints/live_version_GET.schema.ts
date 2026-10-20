import {apiJson} from "../helpers/apiClient";

/** Live version per invalidation domain (`crm_live_version:<domain>`); `version` is the legacy global key; `now` is the database clock (epoch seconds). */
export type OutputType={version:string;domains?:Record<string,string>;now?:string};
export const getLiveVersion=async():Promise<OutputType>=>{
  return apiJson<OutputType>("/_api/live_version",{cache:"no-store"},{fallback:"No se pudo comprobar el modo Live"});
};
