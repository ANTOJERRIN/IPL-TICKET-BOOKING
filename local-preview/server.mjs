import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const directory=fileURLToPath(new URL('.',import.meta.url));
const app=resolve(directory,'../sales-app');
const runtime=join(directory,'.runtime');
mkdirSync(runtime,{recursive:true});
const sql=new DatabaseSync(join(runtime,'bookings.sqlite'));
sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const name of readdirSync(join(app,'migrations')).filter(n=>n.endsWith('.sql')).sort()){
  if(sql.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  sql.exec('BEGIN');
  try{sql.exec(readFileSync(join(app,'migrations',name),'utf8'));sql.prepare('INSERT INTO local_migrations VALUES(?)').run(name);sql.exec('COMMIT');}
  catch(error){sql.exec('ROLLBACK');throw error;}
}
const db={prepare(query){let values=[];return {
  bind(...args){values=args;return this;},
  first(){return sql.prepare(query).get(...values)||null;},
  all(){return {results:sql.prepare(query).all(...values)};},
  run(){const result=sql.prepare(query).run(...values);return {meta:{changes:Number(result.changes)}};}
};},batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
// Local preview deliberately has no payment or email provider credentials.
globalThis.__boundaryLocalBindings={DB:db,...(process.env.ADMIN_EMAIL?{ADMIN_EMAIL:process.env.ADMIN_EMAIL}:{})};
const source=readFileSync(join(app,'src/lib/shop.server.ts'),'utf8');
const bindingImport="import { bindings } from './bindings.server';";
if(!source.includes(bindingImport))throw new Error('The server binding import changed; update the local adapter.');
const handlerFile=join(runtime,'shop.ts');
writeFileSync(handlerFile,source.replace(bindingImport,'const bindings=()=> (globalThis as any).__boundaryLocalBindings;'));
const {shop}=await import(pathToFileURL(handlerFile).href);
await build({absWorkingDir:directory,entryPoints:['entry.tsx'],outfile:join(runtime,'app.js'),bundle:true,format:'esm',jsx:'automatic',nodePaths:[join(directory,'node_modules')],plugins:[{
  name:'local-route-entry',setup(builder){
    builder.onResolve({filter:/^@tanstack\/react-router$/},()=>({path:'router',namespace:'local-route'}));
    builder.onLoad({filter:/.*/,namespace:'local-route'},()=>({contents:'export const createFileRoute = () => options => options;',loader:'js'}));
  }
}]});
// The storefront uses its own authored CSS; platform-only Tailwind imports are
// not needed by this local entry. The source stylesheet stays unchanged.
const css=readFileSync(join(app,'src/styles.css'),'utf8').replace(/^@(import|source|layer)[^\n]*\r?\n/gm,'');
writeFileSync(join(runtime,'app.css'),css);
const port=Number(process.env.PORT||5173);
const origin=`http://localhost:${port}`;
const types={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const html='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boundary Ticket Club — Local Preview</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/local-assets/app.css"></head><body><div id="root"></div><script type="module" src="/local-assets/app.js"></script></body></html>';
createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,origin);
    if(url.pathname.startsWith('/local-assets/')&&!['/local-assets/app.js','/local-assets/app.css'].includes(url.pathname)){
      response.writeHead(404);response.end('Not found');return;
    }
    if(url.pathname.startsWith('/api/')){
      let size=0;const chunks=[];
      for await(const chunk of request){size+=chunk.length;if(size>16000){response.writeHead(413);response.end('Request too large');return;}chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      const result=await shop(new Request(url,{method:request.method,headers:request.headers,body:['GET','HEAD'].includes(request.method)?undefined:body}));
      response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));return;
    }
    const base=url.pathname.startsWith('/local-assets/')?runtime:join(app,'public');
    const relative=url.pathname.startsWith('/local-assets/')?url.pathname.slice('/local-assets/'.length):url.pathname.slice(1);
    const file=resolve(base,decodeURIComponent(relative));
    if(file.startsWith(base+sep)&&existsSync(file)&&extname(file)){
      response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});response.end(readFileSync(file));return;
    }
    if(url.pathname!=='/'){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);
  }catch(error){console.error(error.message);response.writeHead(500);response.end('Local preview error');}
}).listen(port,'localhost',()=>console.log(`Boundary Ticket Club is ready at ${origin}`));
