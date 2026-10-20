import React from 'react';
import {Stack,Text,Title,Group} from '@mantine/core';
import {Button} from './Button';
import {isChunkLoadError,reloadOnceForStaleChunk} from '../helpers/chunkReload';

interface State{error:Error|null}

/** Catches render errors below it. Chunk-load failures trigger one guarded reload; anything else shows a Spanish fallback with retry/reload. */
export class AppErrorBoundary extends React.Component<{children:React.ReactNode},State>{
  state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return {error};}
  componentDidCatch(error:Error){
    console.error(error);
    if(isChunkLoadError(error))reloadOnceForStaleChunk();
  }
  render(){
    if(!this.state.error)return this.props.children;
    return <main role="alert" style={{display:'flex',justifyContent:'center',padding:'4rem 1rem'}}>
      <Stack gap="md" maw={480} align="center" ta="center">
        <Title order={2}>Algo salió mal al mostrar esta pantalla.</Title>
        <Text c="dimmed">{isChunkLoadError(this.state.error)?'Hay una versión nueva de la aplicación. Recargá la página para continuar.':'Podés reintentar o recargar la página. Si escribiste algo sin guardar, puede perderse al recargar.'}</Text>
        <Group>
          <Button onClick={()=>this.setState({error:null})}>Reintentar</Button>
          <Button variant="outline" onClick={()=>window.location.reload()}>Recargar</Button>
        </Group>
      </Stack>
    </main>;
  }
}

/** Boundary keyed by pathname so navigating away resets a failed screen. */
export function RouteErrorBoundary({pathname,children}:{pathname:string;children:React.ReactNode}){
  return <AppErrorBoundary key={pathname}>{children}</AppErrorBoundary>;
}
