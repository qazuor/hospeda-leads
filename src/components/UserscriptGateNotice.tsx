import {Link,useInRouterContext} from 'react-router-dom';
import {Button} from './Button';

/**
 * Spec 96 §3.3: the visible status line of the WhatsApp/Instagram gate, under the buttons it disables, so the way out is reachable
 * (a disabled button's tooltip cannot hold a link). Nothing while waiting or when nothing blocks.
 */
export function UserscriptGateNotice({gate}:{gate:{reason:string;waiting:boolean;unverified:boolean;recheck:()=>void}}){
 // Outside a router (an isolated component) the link degrades to a plain anchor instead of throwing.
 const routed=useInRouterContext();
 if(!gate.reason)return null;
 if(gate.waiting)return <p role="status" data-userscript-gate="waiting">{gate.reason}</p>;
 return <p role="status" data-userscript-gate="blocked">{gate.reason} {routed?<Link to="/userscript">Ir a User script</Link>:<a href="/userscript">Ir a User script</a>}{gate.unverified&&<> · <Button size="sm" variant="link" onClick={gate.recheck}>Verificar de nuevo</Button></>}</p>;
}
