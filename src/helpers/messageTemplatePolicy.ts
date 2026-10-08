type TemplateScope = {channel:string;vertical?:string|null;commercialProfile?:string|null};

/** Segmentation is explicit; an unknown management value does not hide models. */
export function templateCompatibility(template:TemplateScope,context:TemplateScope):string|null {
  if(template.channel!==context.channel)return 'El modelo corresponde a otro canal.';
  const vertical=context.vertical?.trim(),profile=context.commercialProfile?.trim();
  if(vertical&&template.vertical?.trim()&&template.vertical.trim()!==vertical)
    return `El modelo corresponde a la vertical ${template.vertical.trim()}.`;
  if(profile&&template.commercialProfile?.trim()&&template.commercialProfile.trim()!==profile)
    return `El modelo corresponde al perfil ${template.commercialProfile.trim()}.`;
  return null;
}

export const TEMPLATE_SCOPE_HELP='La vertical y el perfil limitan dónde aparece el modelo. “Todas las verticales” y “Todos los perfiles” lo hacen general. Si la gestión no tiene alguno de esos datos, se muestran todos los valores de ese dato para revisar antes de elegir.';
