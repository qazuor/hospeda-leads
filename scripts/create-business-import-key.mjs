import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=process.argv[2];if(!dir)throw new Error('Indicá un directorio nuevo fuera del repositorio para guardar la clave.');
await mkdir(dir,{mode:0o700});
const token=randomBytes(32).toString('base64url');
await writeFile(resolve(dir,'business-import.token'),token+'\n',{mode:0o600,flag:'wx'});
await writeFile(resolve(dir,'business-import.sha256'),createHash('sha256').update(token).digest('hex')+'\n',{mode:0o600,flag:'wx'});
console.log('Clave y hash guardados en '+resolve(dir)+'. La clave no se imprime.');
