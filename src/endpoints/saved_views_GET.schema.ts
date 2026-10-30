import {apiJson} from "../helpers/apiClient";
export type SavedLeadView={id?:string;name:string;config:Record<string,unknown>};
export type OutputType={views:SavedLeadView[]};
export const getSavedLeadViews=async():Promise<OutputType>=>{
  return apiJson<OutputType>("/_api/saved_views");
};
