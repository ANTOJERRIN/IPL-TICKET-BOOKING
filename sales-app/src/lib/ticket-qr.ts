// Fixed version 3-L QR: one 55-byte data block and 15 Reed-Solomon bytes.
// Payloads are booking UUIDs only; no customer data or third-party image service.
export function ticketQr(value:string):boolean[][] {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid booking reference');
 const bits:number[]=[];const put=(n:number,len:number)=>{for(let i=len-1;i>=0;i--)bits.push((n>>>i)&1);};
 put(4,4);put(value.length,8);for(const c of value)put(c.charCodeAt(0),8);put(0,4);while(bits.length%8)bits.push(0);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));
 for(let i=0;data.length<55;i++)data.push(i%2?0x11:0xec);
 const mul=(a:number,b:number)=>{let r=0;while(b){if(b&1)r^=a;a=(a<<1)^((a&128)?0x11d:0);b>>>=1;}return r;};
 let poly=[1],root=1;for(let i=0;i<15;i++){const p=new Array(poly.length+1).fill(0);poly.forEach((v,j)=>{p[j]^=v;p[j+1]^=mul(v,root);});poly=p;root=mul(root,2);}
 const rem=[...data,...new Array(15).fill(0)];for(let i=0;i<55;i++){const v=rem[i];poly.forEach((p,j)=>rem[i+j]^=mul(p,v));}
 const stream=[...data,...rem.slice(55)].flatMap(n=>Array.from({length:8},(_,i)=>(n>>>(7-i))&1));
 const size=29,m=Array.from({length:size},()=>Array<boolean>(size).fill(false)),fixed=m.map(r=>r.map(()=>false));
 const set=(x:number,y:number,v:boolean)=>{if(x>=0&&y>=0&&x<size&&y<size){m[y][x]=v;fixed[y][x]=true;}};
 for(const [cx,cy] of [[3,3],[25,3],[3,25]])for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const d=Math.max(Math.abs(x),Math.abs(y));set(cx+x,cy+y,d!==2&&d!==4);}
 for(let i=8;i<size-8;i++){set(i,6,i%2===0);set(6,i,i%2===0);}
 for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)set(22+x,22+y,Math.max(Math.abs(x),Math.abs(y))!==1);
 const format=0x77c4;const fb=(i:number)=>!!((format>>>i)&1);
 for(let i=0;i<=5;i++)set(8,i,fb(i));set(8,7,fb(6));set(8,8,fb(7));set(7,8,fb(8));for(let i=9;i<15;i++)set(14-i,8,fb(i));
 for(let i=0;i<8;i++)set(size-1-i,8,fb(i));for(let i=8;i<15;i++)set(8,size-15+i,fb(i));set(8,size-8,true);
 let index=0,up=true;for(let right=size-1;right>=1;right-=2){if(right===6)right--;for(let row=0;row<size;row++){const y=up?size-1-row:row;for(let dx=0;dx<2;dx++){const x=right-dx;if(!fixed[y][x])m[y][x]=!!((stream[index++]||0)^((x+y)%2===0?1:0));}}up=!up;}
 return m;
}
