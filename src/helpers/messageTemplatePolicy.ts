type TemplateScope = {channel:string;vertical?:string|null;commercialProfile?:string|null;managementType?:string|null;purpose?:string|null};

/** Segmentation is explicit; an unknown management value does not hide models. */
export function templateCompatibility(template:TemplateScope,context:TemplateScope):string|null {
  if(template.channel!==context.channel)return 'El modelo corresponde a otro canal.';
  if(template.purpose&&context.purpose&&template.purpose!==context.purpose)return 'El modelo corresponde a otro propósito.';
  const managementType=context.managementType?.trim();
  if(managementType&&template.managementType?.trim()&&template.managementType.trim()!==managementType)
    return 'El modelo corresponde a otro tipo de gestión.';
  const vertical=context.vertical?.trim(),profile=context.commercialProfile?.trim();
  if(vertical&&template.vertical?.trim()&&canonicalVertical(template.vertical.trim())!==canonicalVertical(vertical))
    return `El modelo corresponde a la vertical ${template.vertical.trim()}.`;
  if(profile&&template.commercialProfile?.trim()&&template.commercialProfile.trim()!==profile)
    return `El modelo corresponde al perfil ${template.commercialProfile.trim()}.`;
  return null;
}

export function orderTemplatesBySpecificity<T extends {managementType?:string|null;vertical?:string|null;commercialProfile?:string|null;purpose?:string|null}>(templates:T[]){
 return [...templates].sort((a,b)=>Number(!!b.managementType)+Number(!!b.vertical)+Number(!!b.commercialProfile)+Number(!!b.purpose)-Number(!!a.managementType)-Number(!!a.vertical)-Number(!!a.commercialProfile)-Number(!!a.purpose));
}

export const TEMPLATE_SCOPE_HELP='La vertical y el perfil limitan dónde aparece el modelo. “Todas las verticales” y “Todos los perfiles” lo hacen general. Si la gestión no tiene alguno de esos datos, se muestran todos los valores de ese dato para revisar antes de elegir.';
import {canonicalVertical} from './verticalColors';
