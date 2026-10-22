import React from 'react';

export function MissingCommercialProfileNotice({commercialProfile}:{commercialProfile?:string|null}){
 return commercialProfile?.trim()?null:<p role="note">Este negocio no tiene perfil comercial; el texto usa un tono general. Definilo para ajustarlo.</p>;
}
