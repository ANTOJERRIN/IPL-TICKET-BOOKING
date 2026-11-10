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
sql.exec(readFileSync(new URL('../migrations/0004_operations.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0005_notifications.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0006_admission_actions.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0007_provider_refunds.sql',import.meta.url),'utf8'));
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

a=await call('admin/admit',{id,qty:1},second);assert.equal(a.status,403);
a=await call('admin/admit',{id,qty:1},salesCookie);assert.equal(a.status,409);
a=await call('admin/admit',{id:paidId,qty:1},salesCookie);assert.equal(a.status,409);
console.log('PASS unauthorized, practice and test-mode admission rejected');
sql.prepare("UPDATE checkout_sessions SET payment_mode='live' WHERE order_id=?").run(paidId);
a=await call('admin/admit',{id:paidId,qty:1},salesCookie);assert.equal(a.status,200);assert.equal(a.data.remaining,0);
a=await call('admin/admit',{id:paidId,qty:1},salesCookie);assert.equal(a.status,409);
console.log('PASS admission counted atomically and repeat entry rejected');
a=await call('refund-request',{id:paidId,reason:'Cannot attend'},second);assert.equal(a.status,404);
a=await call('refund-request',{id,reason:'Practice'},salesCookie);assert.equal(a.status,409);
a=await call('refund-request',{id:paidId,reason:'Cannot attend'},salesCookie);assert.equal(a.status,200);
a=await call('refund-request',{id:paidId,reason:'Retry'},salesCookie);assert.equal(a.status,200);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM refund_requests').get().n,1);
console.log('PASS refund requests enforce ownership and eligibility and deduplicate retries');
a=await call('admin/refund-review',{id:paidId},salesCookie);assert.equal(a.status,200);
a=await call('orders',undefined,salesCookie);assert.equal(a.data.orders.find(o=>o.id===paidId).refund_status,'reviewed');
assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(paidId).status,'confirmed');
console.log('PASS review status visible without falsely claiming refund issued');
a=await call('admin/publish',{id:'sales-test',published:false},second);assert.equal(a.status,403);
a=await call('admin/publish',{id:'sales-test',published:false},salesCookie);assert.equal(a.status,200);
a=await call('events');assert.equal(a.data.events.some(e=>e.id==='sales-test'),false);
console.log('PASS administrator can hide inventory, customers cannot');
const malformed=await shop(new Request(origin+'/api/login',{method:'POST',headers:{Origin:origin},body:'null'}));assert.equal(malformed.status,400);
console.log('PASS malformed body returns client error');

a=await call('booking-email',{id},salesCookie);assert.equal(a.status,503);
a=await call('booking-email',{id},second);assert.equal(a.status,404);
console.log('PASS email configuration and ownership enforced');
globalThis.__boundaryTestBindings.RESEND_API_KEY='re_fixture';globalThis.__boundaryTestBindings.EMAIL_FROM='tickets@example.test';
let emailCalls=0;let emailBody='';
globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');emailCalls++;emailBody=String(opts.body);assert.equal(opts.headers['Idempotency-Key'],'booking/'+id);return Response.json({id:'email_fixture'});};
a=await call('booking-email',{id},salesCookie);assert.equal(a.data.status,'sent');assert.match(JSON.parse(emailBody).text,/NOT VALID FOR ADMISSION/);
a=await call('booking-email',{id},salesCookie);assert.equal(a.data.status,'sent');assert.equal(emailCalls,1);
console.log('PASS confirmation email label and persistent duplicate suppression');
globalThis.fetch=async()=>new Response('unavailable',{status:503});
a=await call('booking-email',{id:paidId},salesCookie);assert.equal(a.data.status,'pending');
assert.equal(sql.prepare('SELECT status FROM orders WHERE id=?').get(paidId).status,'confirmed');
const savedPayload=sql.prepare('SELECT payload FROM booking_emails WHERE order_id=?').get(paidId).payload;
sql.prepare('UPDATE booking_emails SET locked_until=0 WHERE order_id=?').run(paidId);
globalThis.fetch=async(url,opts)=>{assert.equal(opts.body,savedPayload);return Response.json({id:'email_retry'});};
a=await call('booking-email',{id:paidId},salesCookie);assert.equal(a.data.status,'sent');
console.log('PASS provider failure preserves confirmation and retry uses stable payload');
sql.prepare('UPDATE booking_emails SET sent_at=NULL,created=0,locked_until=0 WHERE order_id=?').run(paidId);
globalThis.fetch=async()=>{throw new Error('Must not send after deduplication window');};
a=await call('booking-email',{id:paidId},salesCookie);assert.equal(a.data.status,'needs_review');
console.log('PASS ambiguous stale delivery requires review instead of sending duplicate');
globalThis.fetch=realFetch;

let automaticCount=0;
globalThis.fetch=async(url,opts)=>{automaticCount++;assert.equal(url,'https://api.resend.com/emails');return Response.json({id:'auto_'+automaticCount});};
a=await call('reserve',{stand:'practice-mumbai-general',qty:1,idempotency:'automatic-email'},salesCookie);const automaticId=a.data.order.id;
a=await call('pay',{id:automaticId},salesCookie);assert.equal(a.data.confirmed,true);assert.equal(automaticCount,1);
a=await call('pay',{id:automaticId},salesCookie);assert.equal(automaticCount,1);
console.log('PASS practice checkout automatically emails once');
sql.prepare('DELETE FROM booking_emails WHERE order_id=?').run(paidId);
a=await webhook(event);assert.equal(a.status,200);assert.equal(automaticCount,2);
a=await webhook(event);assert.equal(a.status,200);assert.equal(automaticCount,2);
console.log('PASS paid webhook replay recovers missing email without duplicates');
globalThis.fetch=realFetch;

// Admission lookup is private, match scoped, and never admits while scanning.
a=await call('admin/ticket',{id:paidId,eventId:'sales-test'},second);assert.equal(a.status,403);
a=await call('admin/ticket',{id:paidId,eventId:'wrong-match'},salesCookie);assert.equal(a.status,409);
a=await call('admin/ticket',{id,eventId:'practice-mumbai'},salesCookie);assert.equal(a.status,409);
a=await call('admin/ticket',{id:paidId,eventId:'sales-test'},salesCookie);assert.equal(a.status,200);assert.equal(a.data.ticket.remaining,0);assert.equal(a.data.ticket.admitted,1);
console.log('PASS private match-scoped lookup reports counts without admitting');
sql.prepare('DELETE FROM admissions WHERE order_id=?').run(paidId);
a=await call('admin/admit',{id:paidId,eventId:'wrong-match',qty:1,idempotency:'scan-1'},salesCookie);assert.equal(a.status,409);
a=await call('admin/admit',{id:paidId,eventId:'sales-test',qty:1,idempotency:'scan-1'},salesCookie);assert.equal(a.status,200);assert.equal(a.data.admitted,1);
a=await call('admin/admit',{id:paidId,eventId:'sales-test',qty:1,idempotency:'scan-1'},salesCookie);assert.equal(a.status,200);assert.equal(a.data.admitted,1);
a=await call('admin/admit',{id:paidId,eventId:'sales-test',qty:2,idempotency:'scan-1'},salesCookie);assert.equal(a.status,409);
a=await call('admin/admit',{id:paidId,eventId:'sales-test',qty:1,idempotency:'scan-2'},salesCookie);assert.equal(a.status,409);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM admission_actions WHERE order_id=?').get(paidId).n,1);
console.log('PASS admission action retries deduplicate and excess admission rolls back');

// Full provider refunds: isolated provider fixtures, no actual money moves.
globalThis.__boundaryTestBindings.STRIPE_SECRET_KEY='sk_live_fixture';
a=await call('admin/refund',{id:paidId,confirm:true,amount:105000},second);assert.equal(a.status,403);
a=await call('admin/refund',{id,confirm:true,amount:315000},salesCookie);assert.equal(a.status,409);
a=await call('admin/refund',{id:paidId,confirm:true,amount:1},salesCookie);assert.equal(a.status,400);
a=await call('admin/refund',{id:paidId,confirm:true,amount:105000},salesCookie);assert.equal(a.status,409);
console.log('PASS provider refund authorization, amount, practice and prior-entry checks');
sql.prepare('DELETE FROM admissions WHERE order_id=?').run(paidId);
let refundCreates=0,refundStatus='pending',refundBody='';
const refundObject=()=>({id:'re_fixture',amount:105000,currency:'inr',payment_intent:'pi_fixture',status:refundStatus});
globalThis.fetch=async(url,opts)=>{
 if(url.endsWith('/checkout/sessions/cs_fixture'))return Response.json({id:'cs_fixture',client_reference_id:paidId,amount_total:105000,currency:'inr',payment_status:'paid',livemode:true,payment_intent:'pi_fixture'});
 if(url==='https://api.stripe.com/v1/refunds'){refundCreates++;assert.equal(opts.headers['Idempotency-Key'],'refund/'+paidId);refundBody=String(opts.body);return Response.json(refundObject());}
 if(url==='https://api.stripe.com/v1/refunds/re_fixture')return Response.json(refundObject());
 throw new Error('Unexpected provider call '+url);
};
a=await call('admin/refund',{id:paidId,confirm:true,amount:105000},salesCookie);assert.equal(a.status,200);assert.equal(a.data.status,'pending');
assert.equal(new URLSearchParams(refundBody).get('amount'),'105000');assert.equal(new URLSearchParams(refundBody).get('payment_intent'),'pi_fixture');
a=await call('admin/refund',{id:paidId,confirm:true,amount:105000},salesCookie);assert.equal(a.data.status,'pending');assert.equal(refundCreates,1);
a=await call('admin/admit',{id:paidId,qty:1,idempotency:'after-refund'},salesCookie);assert.equal(a.status,409);
a=await call('admin/ticket',{id:paidId,eventId:'sales-test'},salesCookie);assert.equal(a.status,409);
console.log('PASS stable full refund parameters, duplicate suppression and pending entry block');
refundStatus='succeeded';a=await call('admin/refund-refresh',{id:paidId},salesCookie);assert.equal(a.status,200);assert.equal(a.data.status,'succeeded');
a=await call('orders',undefined,salesCookie);assert.equal(a.data.orders.find(o=>o.id===paidId).provider_refund_status,'succeeded');
refundStatus='pending';a=await call('admin/refund-refresh',{id:paidId},salesCookie);assert.equal(a.data.status,'succeeded');
console.log('PASS refund status reconciliation and customer visibility never regress success');
sql.prepare('UPDATE provider_refunds SET provider_id=NULL,created=0 WHERE order_id=?').run(paidId);
a=await call('admin/refund',{id:paidId,confirm:true,amount:105000},salesCookie);assert.equal(a.status,409);assert.equal(refundCreates,1);
console.log('PASS ambiguous old refunds cannot create a second refund after deduplication expiry');
globalThis.fetch=realFetch;

function refundFixture(name){
 sql.prepare("INSERT INTO orders SELECT ?,user_id,stand_id,qty,total,status,expires,created,demo,?,? FROM orders WHERE id=?").run(name,'cs_'+name,name,paidId);
 sql.prepare("INSERT INTO checkout_sessions VALUES(?,9999999999,'live')").run(name);
 sql.prepare("INSERT INTO refund_requests(order_id,user_id,reason,status,created) SELECT ?,user_id,'Fixture','reviewed',created FROM orders WHERE id=?").run(name,name);
}
refundFixture('retry');let retryPosts=0;const retryBodies=[];
globalThis.fetch=async(url,opts)=>{
 if(url.endsWith('/checkout/sessions/cs_retry'))return Response.json({id:'cs_retry',client_reference_id:'retry',amount_total:105000,currency:'inr',payment_status:'paid',livemode:true,payment_intent:'pi_retry'});
 if(url==='https://api.stripe.com/v1/refunds'){retryPosts++;retryBodies.push(String(opts.body));if(retryPosts===1)throw new Error('Simulated ambiguous network failure');return Response.json({id:'re_retry',amount:105000,currency:'inr',payment_intent:'pi_retry',status:'pending'});}
 if(url==='https://api.stripe.com/v1/refunds/re_retry')return Response.json({id:'re_retry',amount:105000,currency:'inr',payment_intent:'pi_retry',status:'succeeded'});
 throw new Error('Unexpected call '+url);
};
a=await call('admin/refund',{id:'retry',amount:105000,confirm:true},salesCookie);assert.equal(a.status,502);
a=await call('admin/refund',{id:'retry',amount:105000,confirm:true},salesCookie);assert.equal(a.status,200);assert.equal(retryBodies[0],retryBodies[1]);
assert.throws(()=>sql.prepare('INSERT INTO admissions VALUES(?,?,?,?)').run('retry',1,1,'operator'),/refund blocks admission/);
console.log('PASS ambiguous refund retry preserves parameters and database blocks entry races');
a=await webhook({id:'evt_refund',type:'refund.updated',livemode:true,data:{object:{id:'re_retry',status:'failed'}}});assert.equal(a.status,200);
assert.equal(sql.prepare('SELECT status FROM provider_refunds WHERE order_id=?').get('retry').status,'succeeded');
a=await call('admin',undefined,salesCookie);assert.equal(a.data.refundedTotal,210000);
console.log('PASS signed refund event retrieves current provider state and accounting includes refunds');
refundFixture('bad-session');
globalThis.fetch=async()=>Response.json({id:'cs_bad-session',client_reference_id:'someone-else',amount_total:105000,currency:'inr',payment_status:'paid',livemode:true,payment_intent:'pi_wrong'});
a=await call('admin/refund',{id:'bad-session',amount:105000,confirm:true},salesCookie);assert.equal(a.status,409);assert.equal(sql.prepare('SELECT provider_id FROM provider_refunds WHERE order_id=?').get('bad-session').provider_id,null);
console.log('PASS original payment mismatch cannot issue a refund');
globalThis.fetch=realFetch;

refundFixture('invalid-refund');let invalidCreates=0;
globalThis.fetch=async(url,opts)=>{
 if(url.endsWith('/checkout/sessions/cs_invalid-refund'))return Response.json({id:'cs_invalid-refund',client_reference_id:'invalid-refund',amount_total:105000,currency:'inr',payment_status:'paid',livemode:true,payment_intent:'pi_invalid'});
 invalidCreates++;return Response.json({id:'re_invalid',amount:1,currency:'inr',payment_intent:'pi_invalid',status:'succeeded'});
};
a=await call('admin/refund',{id:'invalid-refund',amount:105000,confirm:true},salesCookie);assert.equal(a.status,502);assert.equal(sql.prepare('SELECT status FROM provider_refunds WHERE order_id=?').get('invalid-refund').status,'initiating');
console.log('PASS malformed provider refund cannot falsely mark the booking refunded');
globalThis.__boundaryTestBindings.STRIPE_SECRET_KEY='sk_test_fixture';
a=await call('admin/refund',{id:'invalid-refund',amount:105000,confirm:true},salesCookie);assert.equal(a.status,503);assert.equal(invalidCreates,1);
console.log('PASS test credentials cannot issue refunds against recorded live payments');
globalThis.fetch=realFetch;
