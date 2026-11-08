import { bindings } from './bindings.server';
const now=()=>Math.floor(Date.now()/1000);
const out=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),x=>x.toString(16).padStart(2,'0')).join('');
async function digest(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
async function password(s:string,salt:string=crypto.randomUUID()){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(s),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function text(v:unknown,max=120){if(typeof v!=='string'||!v.trim()||v.length>max)fail('Please check the form fields.');return v.trim();}
export async function shop(request:Request):Promise<Response>{
 const db=bindings().DB;if(!db)return out({error:'Store is being configured. Please try again shortly.'},503);
 const secrets=bindings() as unknown as Record<string,string>;const url=new URL(request.url);const path=url.pathname;const time=now();
 try{
 if(request.method==='POST'&&path!=='/api/webhook'&&request.headers.get('origin')!==url.origin)fail('Request origin rejected.',403);
 if(Number(request.headers.get('content-length')||0)>16000)fail('Request too large.',413);
 const cookie=request.headers.get('cookie')?.match(/(?:^|; )boundary_session=([^;]+)/)?.[1];
 const user=cookie?await db.prepare('SELECT c.id,c.name,c.email FROM sessions s JOIN customers c ON c.id=s.user_id WHERE s.token=? AND s.expires>?').bind(await digest(cookie),time).first<{id:string;name:string;email:string}>():null;
 const paymentsConfigured=!!secrets.STRIPE_SECRET_KEY&&!!secrets.STRIPE_WEBHOOK_SECRET;
 const paymentMode=secrets.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':secrets.STRIPE_SECRET_KEY?.startsWith('sk_test_')?'test':'unconfigured';
 const need=()=>{if(!user)fail('Please sign in to continue.',401);return user!;};
 if(request.method==='GET'){
 if(path==='/api/sales-status')return out({paymentsConfigured,paymentMode:paymentsConfigured?paymentMode:'unconfigured',practiceAvailable:true});
 if(path==='/api/me')return out({user});
 if(path==='/api/events'){const events=await db.prepare('SELECT * FROM events WHERE published=1 ORDER BY starts').all();const stands=await db.prepare("SELECT s.*,MAX(0,s.capacity-COALESCE((SELECT SUM(qty) FROM orders o WHERE o.stand_id=s.id AND (o.status='confirmed' OR (o.status='reserved' AND o.expires>?))),0)) available FROM stands s").bind(time).all();return out({events:events.results,stands:stands.results});}
 if(path==='/api/orders'){const u=need();return out({orders:(await db.prepare("SELECT o.*,d.buyer_name,d.buyer_email,d.phone,s.name stand,e.home,e.away,e.venue,e.city,e.starts FROM orders o LEFT JOIN checkout_details d ON d.order_id=o.id JOIN stands s ON s.id=o.stand_id JOIN events e ON e.id=s.event_id WHERE o.user_id=? ORDER BY o.created DESC").bind(u.id).all()).results.map((o:any)=>({...o,status:o.status==='reserved'&&o.expires<=time?'expired':o.status}))});}
 if(path==='/api/admin'){const u=need();if(!secrets.ADMIN_EMAIL||u.email!==secrets.ADMIN_EMAIL.toLowerCase())fail('Administrator access required.',403);
 const summary=await db.prepare("SELECT COALESCE(SUM(CASE WHEN o.demo=0 AND o.status='confirmed' AND c.payment_mode='live' THEN o.total ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN o.demo=0 AND o.status='confirmed' AND c.payment_mode='live' THEN o.qty ELSE 0 END),0) tickets_sold,COALESCE(SUM(CASE WHEN o.status='reserved' AND o.expires>? THEN 1 ELSE 0 END),0) active_reservations,COALESCE(SUM(CASE WHEN o.demo=1 AND o.status='confirmed' THEN 1 ELSE 0 END),0) practice_orders FROM orders o LEFT JOIN checkout_sessions c ON c.order_id=o.id").bind(time).first();
 const reconciliation=(await db.prepare("SELECT id,created FROM payment_events WHERE id LIKE 'late:%' ORDER BY created DESC LIMIT 50").all()).results;
 return out({summary,reconciliation,paymentMode,webhookConfigured:!!secrets.STRIPE_WEBHOOK_SECRET,events:(await db.prepare('SELECT * FROM events ORDER BY starts').all()).results,orders:(await db.prepare('SELECT id,qty,total,status,demo,created FROM orders ORDER BY created DESC LIMIT 100').all()).results,paymentsConfigured});}
 fail('Not found.',404);
 }
 if(request.method!=='POST')fail('Method not allowed.',405);
 if(path==='/api/webhook'){
 if(!secrets.STRIPE_WEBHOOK_SECRET)fail('Webhook not configured.',503);
 const raw=await request.text();if(raw.length>16000)fail('Request too large.',413);
 const sig=request.headers.get('stripe-signature')||'';const ts=sig.match(/(?:^|,)t=(\d+)/)?.[1];const signatures=[...sig.matchAll(/(?:^|,)v1=([a-f0-9]+)/g)].map(x=>x[1]);
 if(!ts||Math.abs(time-Number(ts))>300)fail('Invalid signature.',400);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secrets.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ts+'.'+raw)));if(!signatures.some(s=>equal(s,expected)))fail('Invalid signature.',400);
 const event=JSON.parse(raw);if(event.type!=='checkout.session.completed')return out({received:true});const s=event.data.object;if(s.payment_status!=='paid')return out({received:true});
 const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(s.client_reference_id).first<any>();if(order&&!order.payment_id)fail('Checkout is still being recorded. Retry notification.',503);if(!order||order.demo||order.total!==s.amount_total||s.currency!=='inr'||order.payment_id!==s.id)fail('Payment does not match order.');
 if(order.status==='confirmed')return out({received:true});
 // Late payment never oversells: retain a reconciliation record for operator refund.
 if(order.status!=='reserved'||order.expires<=time){await db.prepare('INSERT OR IGNORE INTO payment_events VALUES(?,?)').bind('late:'+event.id,time).run();return out({received:true,reconciliation:true});}
 await db.batch([db.prepare("UPDATE orders SET status='confirmed' WHERE id=? AND status='reserved' AND expires>?").bind(order.id,time),db.prepare('INSERT OR IGNORE INTO payment_events VALUES(?,?)').bind(event.id,time)]);return out({received:true});
 }
 const raw=await request.text();if(raw.length>16000)fail('Request too large.',413);const body=JSON.parse(raw||'{}');
 if(['/api/signup','/api/login','/api/forgot','/api/reset'].includes(path)){
 const ip=request.headers.get('cf-connecting-ip')||'unknown';const bucket=await digest(ip+':'+Math.floor(time/900));await db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(bucket,time+900).run();const a=await db.prepare('SELECT count FROM attempts WHERE bucket=?').bind(bucket).first<{count:number}>();if(a&&a.count>30)fail('Too many attempts. Please try again in 15 minutes.',429);
 await db.prepare('DELETE FROM attempts WHERE expires<?').bind(time).run();
 }
 if(path==='/api/signup'||path==='/api/login'){
 const email=text(body.email,254).toLowerCase();const pw=text(body.password,128);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||pw.length<10)fail('Use a valid email and a password of at least 10 characters.');let id:string;
 if(path==='/api/signup'){id=crypto.randomUUID();try{await db.prepare('INSERT INTO customers VALUES(?,?,?,?,?)').bind(id,text(body.name,80),email,await password(pw),time).run();}catch{fail('Unable to create account. Try signing in or use another email.');}}
 else{const found=await db.prepare('SELECT id,password FROM customers WHERE email=?').bind(email).first<{id:string;password:string}>();const encoded=await password(pw,found?.password.split(':')[0]||'invalid-account');if(!found||!equal(encoded,found.password))fail('Email or password is incorrect.',401);id=found.id;}
 const token=crypto.randomUUID()+crypto.randomUUID();await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token),id,time+604800).run();return out({ok:true},200,{'Set-Cookie':`boundary_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`});
 }
 if(path==='/api/logout'){if(cookie)await db.prepare('DELETE FROM sessions WHERE token=?').bind(await digest(cookie)).run();return out({ok:true},200,{'Set-Cookie':'boundary_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});}
 if(path==='/api/forgot'){
 if(!secrets.RESEND_API_KEY||!secrets.EMAIL_FROM)fail('Password recovery email is not configured yet.',503);const email=text(body.email,254).toLowerCase();const found=await db.prepare('SELECT id FROM customers WHERE email=?').bind(email).first<{id:string}>();if(found){const token=crypto.randomUUID()+crypto.randomUUID();await db.prepare('INSERT INTO resets VALUES(?,?,?)').bind(await digest(token),found.id,time+1800).run();const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+secrets.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:secrets.EMAIL_FROM,to:email,subject:'Reset your Boundary password',text:`Reset your password within 30 minutes: ${url.origin}/?reset=${token}`})});if(!r.ok)fail('Email could not be sent. Please try again later.',503);}return out({ok:true,message:'If the account exists, a recovery link has been sent.'});
 }
 if(path==='/api/reset'){const pw=text(body.password,128);if(pw.length<10)fail('Use at least 10 characters.');const token=await digest(text(body.token,100));const reset=await db.prepare('SELECT user_id FROM resets WHERE token=? AND expires>?').bind(token,time).first<{user_id:string}>();if(!reset)fail('Recovery link expired. Request another.');await db.batch([db.prepare('UPDATE customers SET password=? WHERE id=?').bind(await password(pw),reset.user_id),db.prepare('DELETE FROM resets WHERE user_id=?').bind(reset.user_id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(reset.user_id)]);return out({ok:true});}
 if(path==='/api/reserve'){
 const u=need();const qty=Number(body.qty);if(!Number.isInteger(qty)||qty<1||qty>6)fail('Choose between 1 and 6 tickets.');const standId=text(body.stand,100);const idem=text(body.idempotency,100);const previous=await db.prepare('SELECT * FROM orders WHERE user_id=? AND idempotency=?').bind(u.id,idem).first();if(previous)return out({order:previous});
 const stand=await db.prepare('SELECT s.*,e.demo,e.starts FROM stands s JOIN events e ON e.id=s.event_id WHERE s.id=? AND e.published=1').bind(standId).first<any>();if(!stand||new Date(stand.starts).getTime()<Date.now())fail('This match is unavailable.');if(!stand.demo&&!paymentsConfigured)fail('Payment checkout and verification must be configured before live reservations.',503);
 const buyerName=text(body.buyerName,80);const phone=text(body.phone,24);if(!/^\+?[0-9 ()-]{7,24}$/.test(phone)||phone.replace(/\D/g,'').length<7)fail('Enter a valid contact phone number.');if(body.accepted!==true)fail('Please review and accept the booking conditions.');
 const active=await db.prepare("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='reserved' AND expires>?").bind(u.id,time).first<{n:number}>();if(active&&active.n>=3)fail('Complete or cancel an existing reservation first.');const id=crypto.randomUUID();const total=stand.price*qty+Math.round(stand.price*qty*0.05);try{await db.batch([db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,'reserved',?,?,?,NULL,?)").bind(id,u.id,standId,qty,total,time+1800,time,stand.demo,idem),db.prepare("INSERT INTO checkout_details VALUES(?,?,?,?,?,?)").bind(id,buyerName,u.email,phone,time,"booking-v1")]);}catch{fail('These tickets just sold out. Refresh and choose another stand.',409);}return out({order:{id,total,qty,expires:time+1800,demo:stand.demo,status:'reserved'}});
 }
 if(path==='/api/cancel'){const u=need();const existing=await db.prepare('SELECT payment_id,status FROM orders WHERE id=? AND user_id=?').bind(text(body.id,100),u.id).first<any>();if(!existing)fail('Order not found.',404);if(existing.payment_id)fail('Payment checkout already started. The reservation will release after checkout expires.',409);if(existing.status==='confirmed')fail('Confirmed bookings cannot be cancelled here.',409);await db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status='reserved' AND payment_id IS NULL").bind(text(body.id,100),u.id).run();return out({ok:true});}
 if(path==='/api/pay'){
 const u=need();const o=await db.prepare('SELECT o.*,s.name,e.home,e.away FROM orders o JOIN stands s ON s.id=o.stand_id JOIN events e ON e.id=s.event_id WHERE o.id=? AND o.user_id=?').bind(text(body.id,100),u.id).first<any>();if(!o)fail('Order not found.',404);if(o.status==='confirmed')return out({confirmed:true});if(o.status!=='reserved'||o.expires<=time)fail('Reservation expired. Please reserve again.');
 if(o.demo){await db.prepare("UPDATE orders SET status='confirmed' WHERE id=? AND status='reserved' AND expires>?").bind(o.id,time).run();return out({confirmed:true,demo:true});}
 if(!paymentsConfigured)fail('Payment checkout and verification are not configured.',503);
 // Persist checkout expiry once: retrying a provider request must use identical parameters.
 await db.prepare('INSERT OR IGNORE INTO checkout_sessions VALUES(?,?,?)').bind(o.id,time+1860,paymentMode).run();
 const checkout=await db.prepare('SELECT expires FROM checkout_sessions WHERE order_id=?').bind(o.id).first<{expires:number}>();if(!checkout)fail('Unable to start payment.',503);
 o.expires=checkout.expires;
 if(!o.payment_id&&o.expires-time<1800)fail('The payment attempt could not be completed. Reserve again after this hold expires.',409);
 const renewed=await db.prepare("UPDATE orders SET expires=? WHERE id=? AND status='reserved' AND expires>?").bind(o.expires,o.id,time).run();if(!renewed.meta.changes)fail('Reservation expired. Please reserve again.');
 const form=new URLSearchParams({mode:'payment',success_url:url.origin+'/?payment=success&order='+o.id,cancel_url:url.origin+'/?payment=cancelled&order='+o.id,client_reference_id:o.id,customer_email:u.email,'line_items[0][price_data][currency]':'inr','line_items[0][price_data][unit_amount]':String(o.total),'line_items[0][price_data][product_data][name]':`${o.home} vs ${o.away} · ${o.qty} tickets · ${o.name}`,'line_items[0][quantity]':'1',expires_at:String(o.expires),'payment_method_types[0]':'card','payment_intent_data[receipt_email]':u.email});
 const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+secrets.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':o.id},body:form});const data=await r.json() as any;if(!r.ok||!data.url)fail('Payment checkout is unavailable. Please try again.',502);await db.prepare('UPDATE orders SET payment_id=? WHERE id=?').bind(data.id,o.id).run();return out({url:data.url});
 }
 if(path==='/api/admin/event'){
 const u=need();if(!secrets.ADMIN_EMAIL||u.email!==secrets.ADMIN_EMAIL.toLowerCase())fail('Administrator access required.',403);const id=crypto.randomUUID();const starts=text(body.starts,40);if(!Number.isFinite(Date.parse(starts))||Date.parse(starts)<Date.now())fail('Choose a future match date.');const cap=Number(body.capacity),price=Number(body.price);if(!Number.isInteger(cap)||cap<1||cap>100000||!Number.isInteger(price)||price<100||price>100000000)fail('Check capacity and price.');await db.batch([db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,1)').bind(id,text(body.home,12),text(body.away,12),text(body.venue),text(body.city,60),starts,body.demo===false?0:1),db.prepare('INSERT INTO stands VALUES(?,?,?,?,?)').bind(id+'-general',id,'General stand',price,cap)]);return out({ok:true});
 }
 fail('Not found.',404);
 }catch(e:any){return out({error:e.status?e.message:'Something went wrong. Please try again.'},e.status||500);}
}
