import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import net from 'node:net';

test('homepage and AS share the server session without exposing existing data',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'hajin-session-'));
 const dataDir=join(temp,'data');await mkdir(dataDir);
 const seed=JSON.stringify({as_jobs:[{id:41,company:'기존 AS 데이터'}],business_documents:[]});
 await writeFile(join(dataDir,'hajin-data.json'),seed);
 await mkdir(join(temp,'dist/client/office'),{recursive:true});
 await writeFile(join(temp,'dist/client/office/index.html'),'<h1>회사 홈페이지</h1>');
 await writeFile(join(temp,'dist/client/index.html'),'<h1>회사 홈페이지 진입</h1>');
 await writeFile(join(temp,'dist/client/as.html'),'<h1>기존 AS 앱</h1>');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const password=randomBytes(24).toString('hex');
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:temp,env:{...process.env,ECOUNT_COM_CODE:'',ECOUNT_USER_ID:'',ECOUNT_API_CERT_KEY:'',ECOUNT_MODE:'test',PORT:String(port),ADMIN_ID:'session-test',ADMIN_PASSWORD:password,DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('server startup timeout')),10000);child.once('exit',code=>{clearTimeout(timeout);reject(Error('server exited '+code));});child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});});
 const request=(p,options={})=>fetch(`http://127.0.0.1:${port}${p}`,{redirect:'manual',...options});
 let r=await request('/api/version');assert.equal((await r.json()).version,'hajin-office-home-v3');
 r=await request('/');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/office/');
 r=await request('/office/');assert.equal(r.status,200);assert.match(await r.text(),/회사 홈페이지/);
 r=await request('/as');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/office/#overview');
 r=await request('/api/ecount/status');assert.equal(r.status,401);
 r=await request('/api/ecount/inventory');assert.equal(r.status,401);
 r=await request('/api/data',{method:'POST',body:JSON.stringify({table:'as_jobs'})});assert.equal(r.status,401);
 r=await request('/api/login',{method:'POST',body:JSON.stringify({email:'session-test',password:'wrong'})});assert.equal(r.status,401);
 r=await request('/api/login',{method:'POST',body:JSON.stringify({email:'session-test',password})});assert.equal(r.status,200);
 const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);const headers={Cookie:cookie.split(';')[0]};
 r=await request('/api/session',{headers});assert.equal((await r.json()).user.id,'session-test');
 r=await request('/api/ecount/status',{headers});assert.equal((await r.json()).configured,false);
 r=await request('/api/ecount/inventory?date=2026-10-22',{headers});assert.equal(r.status,503);
 r=await request('/as',{headers});assert.equal(r.status,200);assert.match(await r.text(),/기존 AS 앱/);
 r=await request('/api/data',{method:'POST',headers,body:JSON.stringify({table:'as_jobs',action:'select'})});assert.equal((await r.json()).data[0].id,41);
 assert.equal(await readFile(join(dataDir,'hajin-data.json'),'utf8'),seed,'existing data must remain unchanged');
 r=await request('/api/logout',{method:'POST',headers});assert.equal(r.status,200);
 r=await request('/api/session',{headers});assert.equal((await r.json()).user,null);
 r=await request('/as',{headers});assert.equal(r.status,302);
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await rm(temp,{recursive:true,force:true});}
});
