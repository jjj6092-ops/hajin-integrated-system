import test from 'node:test';
import assert from 'node:assert/strict';
import {createEcountClient,inventoryFilters} from '../ecount.mjs';
const env={ECOUNT_COM_CODE:'80001',ECOUNT_USER_ID:'fixture-user',ECOUNT_API_CERT_KEY:'fixture-cert',ECOUNT_MODE:'test'};
const filters=()=>inventoryFilters(new URLSearchParams('date=2026-10-22&warehouses=W01&products=P01&includeZero=Y'));
function mockApi({result,inventoryError=false,zone='AA',loginFailure=false}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,body:JSON.parse(opts.body)});
  let data;
  if(url.endsWith('/Zone'))data={Status:200,Data:{ZONE:zone,DOMAIN:'https://untrusted.invalid'}};
  else if(url.endsWith('/OAPILogin'))data=loginFailure?{Status:500,Error:{Message:'fixture-cert'}}:{Status:200,Data:{SESSION_ID:'fixture-session'}};
  else data=inventoryError?{Status:500,Error:{Message:'fixture-session fixture-cert'}}:{Status:200,Data:{TotalCnt:1,Result:result??[{WH_CD:'W01',WH_DES:'본사',PROD_CD:'P01',PROD_DES:'부품',PROD_SIZE_DES:'10mm',BAL_QTY:3}]}};
  return {ok:true,json:async()=>data};
 };return {calls,fetcher};
}
test('Zone -> login -> inventory matches supplied specification and caches without leaking credentials',async()=>{
 const api=mockApi(),client=createEcountClient({env,fetcher:api.fetcher,now:()=>10000});
 const value=await client.inventory(filters());assert.equal(api.calls.length,3);
 assert.equal(api.calls[0].url,'https://sboapi.ecount.com/OAPI/V2/Zone');assert.equal(api.calls[1].url,'https://sboapiAA.ecount.com/OAPI/V2/OAPILogin');assert.equal(api.calls[1].body.LAN_TYPE,'ko-KR');assert.equal(api.calls[1].body.API_CERT_KEY,'fixture-cert');assert.equal(api.calls[2].body.BASE_DATE,'20261022');assert.match(api.calls[2].url,/SESSION_ID=fixture-session$/);
 assert.deepEqual(value.rows[0],{warehouseCode:'W01',warehouseName:'본사',productCode:'P01',productName:'부품',specification:'10mm',quantity:3});assert.equal(value.mode,'test');assert.doesNotMatch(JSON.stringify(value),/fixture-cert|fixture-session/);assert.equal((await client.inventory(filters())).cached,true);assert.equal(api.calls.length,3);
});
test('production uses production hosts only when explicitly configured',async()=>{const api=mockApi();await createEcountClient({env:{...env,ECOUNT_MODE:'production'},fetcher:api.fetcher}).inventory(filters());assert.equal(api.calls[0].url,'https://oapi.ecount.com/OAPI/V2/Zone');assert.match(api.calls[2].url,/https:\/\/oapiAA\.ecount\.com/);});
test('missing configuration does not call upstream or expose values',async()=>{let called=false;const client=createEcountClient({env:{},fetcher:()=>{called=true;}});assert.equal(client.configuration().configured,false);await assert.rejects(client.inventory(filters()),{status:503});assert.equal(called,false);});
test('rejects invalid dates, flags and undocumented multiple-code formatting before requests',()=>{for(const query of ['date=2026-02-30','date=no','date=2026-10-22&includeZero=yes','date=2026-10-22&warehouses=A,B'])assert.throws(()=>inventoryFilters(new URLSearchParams(query)),{status:400});});
test('rejects untrusted Zone hostname and suppresses sensitive upstream errors',async()=>{const malicious=mockApi({zone:'x.evil/'});await assert.rejects(createEcountClient({env,fetcher:malicious.fetcher}).inventory(filters()),/Zone/);assert.equal(malicious.calls.length,1);const api=mockApi({inventoryError:true});await assert.rejects(createEcountClient({env,fetcher:api.fetcher}).inventory(filters()),e=>!e.message.includes('fixture-'));});
test('malformed quantities fail instead of displaying zero, and empty results are valid',async()=>{const bad=mockApi({result:[{BAL_QTY:'unknown'}]});await assert.rejects(createEcountClient({env,fetcher:bad.fetcher}).inventory(filters()),/수량/);const client=createEcountClient({env,fetcher:async(url)=>({ok:true,json:async()=>url.endsWith('/Zone')?{Status:200,Data:{ZONE:'AA'}}:url.endsWith('/OAPILogin')?{Status:200,Data:{SESSION_ID:'test'}}:{Status:200,Data:{TotalCnt:0,Result:[]}}})});assert.deepEqual((await client.inventory(filters())).rows,[]);});
test('coalesces concurrent requests and throttles new filters',async()=>{const api=mockApi(),client=createEcountClient({env,fetcher:api.fetcher,now:()=>1000});await Promise.all([client.inventory(filters()),client.inventory(filters())]);assert.equal(api.calls.length,3);await assert.rejects(client.inventory({...filters(),PROD_CD:'P02'}),{status:429});});
