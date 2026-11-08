// Run with Node 22: node --experimental-strip-types tests/booking.mjs
// Uses in-memory SQLite and the actual authored request handler. No remote writes.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0002_booking.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0003_sales.sql',import.meta.url),'utf8'));
const db={prepare(query){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
globalThis.__boundaryTestBindings={DB:db};
const source=readFileSync(new URL('../src/lib/shop.server.ts',import.meta.url),'utf8').replace("import { bindings } from './bindings.server';","const bindings=()=> (globalThis as any).__boundaryTestBindings;");
const file=join(mkdtempSync(join(tmpdir(),'boundary-')),'handler.ts');writeFileSync(file,source);const {shop}=await import('file://'+file);
const origin='https://store.test';
async function call(path,body,cookie='',extra={}){if(path==='reserve'&&body)body={buyerName:'Test Buyer',phone:'+91 9876543210',accepted:true,...body};const r=await shop(new Request(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)}));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
let a=await call('events');assert.equal(a.data.events.length,4);console.log('PASS catalogue backed by database');
a=await call('orders');assert.equal(a.status,401);console.log('PASS anonymous wallet rejected');
a=await call('signup',{name:'Test One',email:'one@example.test',password:'a long test password'});assert.equal(a.status,200);const cookie=a.cookie;assert.ok(cookie);console.log('PASS account creation and secure session issuance');
a=await call('login',{email:'one@example.test',password:'wrong password'});assert.equal(a.status,401);console.log('PASS wrong password rejected');
a=await call('reserve',{stand:'practice-mumbai-general',qty:-1,idempotency:'negative'},cookie);assert.equal(a.status,400);console.log('PASS invalid ticket quantity rejected');
a=await call('reserve',{stand:'practice-mumbai-general',qty:2,idempotency:'one'},cookie);assert.equal(a.status,200);const id=a.data.order.id;assert.equal(a.data.order.total,315000);console.log('PASS reservation with server-calculated fee');
a=await call('reserve',{stand:'practice-mumbai-general',qty:2,idempotency:'one'},cookie);assert.equal(a.data.order.id,id);assert.equal(sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);console.log('PASS reservation retry is idempotent');
a=await call('signup',{name:'Test Two',email:'two@example.test',password:'a long test password'});const second=a.cookie;a=await call('orders',undefined,second);assert.equal(a.data.orders.length,0);a=await call('pay',{id},second);assert.equal(a.status,404);console.log('PASS customer ownership enforced for wallet and payment');
a=await call('pay',{id},cookie);assert.equal(a.data.confirmed,true);a=await call('pay',{id},cookie);assert.equal(a.data.confirmed,true);console.log('PASS practice checkout and duplicate confirmation');
a=await call('orders',undefined,cookie);assert.equal(a.data.orders[0].status,'confirmed');console.log('PASS confirmed booking persists in wallet');
a=await call('admin',undefined,cookie);assert.equal(a.status,403);console.log('PASS regular customer cannot access administration');
a=await call('reserve',{stand:'practice-mumbai-pavilion',qty:1,idempotency:'expire'},cookie);const expired=a.data.order.id;sql.prepare('UPDATE orders SET expires=0 WHERE id=?').run(expired);a=await call('pay',{id:expired},cookie);assert.equal(a.status,400);console.log('PASS expired hold cannot confirm');
a=await call('reserve',{stand:'practice-mumbai-club',qty:1,idempotency:'cancel'},cookie);const cancelled=a.data.order.id;await call('cancel',{id:cancelled},cookie);assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(cancelled).status,'cancelled');console.log('PASS reservation cancellation');
a=await call('webhook',{});assert.equal(a.status,503);console.log('PASS unconfigured payment webhook fails closed');
const bad=await shop(new Request(origin+'/api/signup',{method:'POST',headers:{Origin:'https://attacker.test'},body:'{}'}));assert.equal(bad.status,403);console.log('PASS cross-origin mutation rejected');
await call('logout',{},cookie);a=await call('orders',undefined,cookie);assert.equal(a.status,401);console.log('PASS logout invalidates server session');

// Sales lifecycle. External payment calls are mocked; no real provider charges.
a=await call('login',{email:'one@example.test',password:'a long test password'});const salesCookie=a.cookie;
a=await call('sales-status');assert.equal(a.data.paymentsConfigured,false);console.log('PASS payment readiness reports missing configuration');
a=await call('reserve',{stand:'practice-mumbai-general',qty:1,idempotency:'no-consent',accepted:false},salesCookie);assert.equal(a.status,400);console.log('PASS checkout requires reviewed booking conditions');
a=await call('reserve',{stand:'practice-mumbai-general',qty:1,idempotency:'bad-phone',phone:'abc'},salesCookie);assert.equal(a.status,400);console.log('PASS checkout rejects invalid buyer contact');
const saved=sql.prepare('SELECT * FROM checkout_details WHERE order_id=?').get(id);assert.equal(saved.buyer_email,'one@example.test');assert.equal(saved.policy_version,'booking-v1');console.log('PASS buyer details and policy acceptance persist');
sql.prepare("INSERT INTO events VALUES('sales-test','MI','CSK','Test venue','Mumbai','2027-05-01T19:30:00+05:30',0,1)").run();sql.prepare("INSERT INTO stands VALUES('sales-stand','sales-test','General',100000,10)").run();
a=await call('reserve',{stand:'sales-stand',qty:1,idempotency:'live-block'},salesCookie);assert.equal(a.status,503);
globalThis.__boundaryTestBindings.STRIPE_SECRET_KEY='sk_test_fixture';a=await call('reserve',{stand:'sales-stand',qty:1,idempotency:'live-block'},salesCookie);assert.equal(a.status,503);console.log('PASS checkout key alone cannot enable non-practice sales');
globalThis.__boundaryTestBindings.STRIPE_WEBHOOK_SECRET='whsec_fixture';globalThis.__boundaryTestBindings.ADMIN_EMAIL='one@example.test';
a=await call('reserve',{stand:'sales-stand',qty:1,idempotency:'provider-order'},salesCookie);assert.equal(a.status,200);const paidId=a.data.order.id;
const realFetch=globalThis.fetch;const providerBodies=[];
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');providerBodies.push(String(options.body));return Response.json({id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture'});};
a=await call('pay',{id:paidId},salesCookie);assert.equal(a.status,200);a=await call('pay',{id:paidId},salesCookie);assert.equal(a.status,200);assert.equal(providerBodies[0],providerBodies[1]);assert.equal(new URLSearchParams(providerBodies[0]).get('line_items[0][price_data][unit_amount]'),'105000');console.log('PASS hosted checkout retry retains identical server-priced parameters');
a=await call('cancel',{id:paidId},salesCookie);assert.equal(a.status,409);console.log('PASS active provider checkout cannot be silently cancelled');
globalThis.fetch=realFetch;
async function webhook(event,timestamp=Math.floor(Date.now()/1000),tamper=false){const raw=JSON.stringify(event);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_fixture'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw));const signature=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');const r=await shop(new Request(origin+'/api/webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${tamper?'bad':signature}`},body:raw}));return {status:r.status,data:await r.json()};}
const event={id:'evt_fixture',type:'checkout.session.completed',data:{object:{id:'cs_fixture',client_reference_id:paidId,payment_status:'paid',amount_total:105000,currency:'inr'}}};
a=await webhook(event,Math.floor(Date.now()/1000),true);assert.equal(a.status,400);a=await webhook(event,Math.floor(Date.now()/1000)-600);assert.equal(a.status,400);console.log('PASS forged and stale payment notifications rejected');
a=await webhook({...event,data:{object:{...event.data.object,amount_total:1}}});assert.equal(a.status,400);console.log('PASS payment amount tampering rejected');
a=await webhook(event);assert.equal(a.status,200);a=await webhook(event);assert.equal(a.status,200);assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(paidId).status,'confirmed');console.log('PASS signed payment confirmation and replay are idempotent');
a=await call('admin',undefined,salesCookie);assert.equal(a.data.summary.revenue,0);assert.equal(a.data.summary.tickets_sold,0);assert.equal(a.data.summary.practice_orders,1);console.log('PASS test payments and practice orders excluded from real revenue');
console.log('Sales and booking integration checks completed.');
