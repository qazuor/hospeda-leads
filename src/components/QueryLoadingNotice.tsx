import {Loader} from '@mantine/core';
export function QueryLoadingNotice({children='Cargando…'}:{children?:React.ReactNode}){
 return <p role="status" aria-live="polite" style={{display:'flex',alignItems:'center',gap:'0.5rem'}}><Loader size="sm" aria-hidden="true"/>{children}</p>;
}
