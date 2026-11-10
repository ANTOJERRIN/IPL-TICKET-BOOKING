import {memo,useCallback,useEffect,useId,useRef,useState} from 'react';
import type {CSSProperties,PointerEvent} from 'react';

type Stand={id:string;name:string;price:number;available:number};
type Point=[number,number];
type Props={stands:Stand[];selectedId:string;onSelect:(id:string)=>void;locked?:boolean;venue:string;compact?:boolean};
const palette=['#f2a66b','#b7b4e9','#b8cf92','#8ac9cf','#e4b9ce'];
const price=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n/100);
const sampleStands:Stand[]=[{id:'general',name:'General stand',price:150000,available:120},{id:'pavilion',name:'Pavilion',price:300000,available:60},{id:'club',name:'Club lounge',price:550000,available:24}];
const rad=(n:number)=>n*Math.PI/180;

// Project a real three-dimensional bowl into SVG. All stands share the same
// projection, so camera changes rotate the field, seat rows and lights together.
const StadiumModel=memo(function StadiumModel({stands,selectedId,onSelect,locked,yaw,tilt,zoom,compact}:{stands:Stand[];selectedId:string;onSelect:(id:string)=>void;locked:boolean;yaw:number;tilt:number;zoom:number;compact:boolean}){
 const uid=useId().replace(/:/g,'');
 const project=(x:number,y:number,z=0):Point=>{
  const a=rad(yaw),b=rad(tilt),rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a);
  return [360+rx*zoom,268+(ry*Math.sin(b)-z*Math.cos(b))*zoom];
 };
 const ellipse=(rx:number,ry:number,z:number,start=0,end=360,count=72)=>Array.from({length:count+1},(_,i)=>project(rx*Math.cos(rad(start+(end-start)*i/count)),ry*Math.sin(rad(start+(end-start)*i/count)),z));
 const path=(points:Point[])=>'M'+points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join('L')+'Z';
 const ring=(outer:number,inner:number,z:number,start:number,end:number)=>path([...ellipse(outer,outer*.76,z,start,end,12),...ellipse(inner,inner*.76,z,end,start,12)]);
 const deck=(inner:number,outer:number,z1:number,z2:number,start:number,end:number)=>path([...ellipse(outer,outer*.76,z2,start,end,12),...ellipse(inner,inner*.76,z1,end,start,12)]);
 const field=ellipse(151,115,8);
 const blocks=Array.from({length:24},(_,i)=>({index:i,angle:i*15+7.5,stand:stands[Math.floor(i*stands.length/24)]})).sort((a,b)=>Math.sin(rad(a.angle+yaw))-Math.sin(rad(b.angle+yaw)));
 const selectedIndex=Math.max(0,stands.findIndex(s=>s.id===selectedId));
 const selected=stands[selectedIndex];
 return <svg className="stadium-model" viewBox="0 0 720 500" aria-label={`Interactive illustrative stadium for ${selected?.name||'stand selection'}`}>
  <defs><radialGradient id={uid+'grass'}><stop stopColor="#689055"/><stop offset="1" stopColor="#355b37"/></radialGradient><linearGradient id={uid+'wall'} x2="0" y2="1"><stop stopColor="#65736e"/><stop offset="1" stopColor="#273730"/></linearGradient><filter id={uid+'glow'} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <ellipse cx="360" cy="369" rx="244" ry="62" fill="#000" opacity=".3"/>
  <path d={path([...ellipse(252,192,0),...ellipse(252,192,-15).reverse()])} fill="#1d2a26" stroke="#6d7c70" strokeWidth=".6"/>
  <path d={ring(252,150,0,0,360)} fill="#34453d"/>
  <path d={path(field)} fill={`url(#${uid}grass)`} stroke="#a1bb7b" strokeWidth="1.5"/>
  {Array.from({length:11},(_,i)=>{const x=-132+i*24,edge=109*Math.sqrt(Math.max(0,1-(x/148)**2));return <path key={i} d={path([project(x,-edge,8.2),project(x+12,-edge,8.2),project(x+12,edge,8.2),project(x,edge,8.2)])} fill="#a2bf7c" opacity=".1"/>;})}
  <path d={path(ellipse(136,103,8.5))} fill="none" stroke="#d5e2b9" strokeWidth="1" strokeDasharray="3 3"/>
  <path d={path([project(-8,-34,9),project(8,-34,9),project(8,34,9),project(-8,34,9)])} fill="#d9c69e" stroke="#eddcba" strokeWidth="1"/>
  {[-26,26].map(y=><path key={y} d={`M${project(-12,y,9.5).join(',')}L${project(12,y,9.5).join(',')}`} stroke="#fff" strokeWidth="1.2"/>)}
  <text x={project(38,0,10)[0]} y={project(38,0,10)[1]} fill="#d7e4c3" fontSize="7" fontWeight="700" letterSpacing="3" opacity=".65">BOUNDARY</text>
  {blocks.map(({index,stand})=>{
   if(!stand)return null;const start=index*15+1.2,end=(index+1)*15-1.2,active=stand.id===selectedId,color=palette[stands.indexOf(stand)%palette.length],disabled=locked||stand.available<1;
   const select=()=>{if(!disabled)onSelect(stand.id);};
   return <g key={index} className={'stadium-sector'+(active?' is-selected':'')+(disabled?' is-unavailable':'')} role={compact?undefined:'button'} tabIndex={compact||disabled||index!==Math.ceil(stands.indexOf(stand)*24/stands.length)?-1:0} aria-label={`${stand.name}, ${price(stand.price)}, ${stand.available} available`} aria-pressed={active} aria-disabled={disabled} onClick={select} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}}}>
    <title>{`${stand.name} - ${price(stand.price)} - ${stand.available} available`}</title>
    <path d={deck(251,251,-2,47,start,end)} fill={`url(#${uid}wall)`} stroke="#18231e" strokeWidth=".8"/>
    <path d={deck(159,197,10,27,start,end)} fill={active?color:'#6b7b73'} stroke="#22362b" strokeWidth="1.5"/>
    <path d={deck(200,242,29,47,start,end)} fill={active?color:'#7a8781'} stroke="#22362b" strokeWidth="1.5"/>
    {[0,1,2,3,4,5,6,7].map(row=>{const r=163+row*4.4,z=12+row*2;return <path key={'lower'+row} d={'M'+ellipse(r,r*.76,z,start+.5,end-.5,8).map(p=>p.join(',')).join('L')} fill="none" stroke={active?'#fff9e4':'#ced3c1'} strokeWidth="1.8" strokeDasharray="1.3 3" opacity={active?.8:.45}/>;})}
    {[0,1,2,3,4,5,6,7].map(row=>{const r=204+row*4.8,z=31+row*2;return <path key={'upper'+row} d={'M'+ellipse(r,r*.76,z,start+.4,end-.4,8).map(p=>p.join(',')).join('L')} fill="none" stroke={active?'#fff9e4':'#d5d9ca'} strokeWidth="2" strokeDasharray="1.3 3" opacity={active?.8:.45}/>;})}
    <path d={'M'+ellipse(247,247*.76,49,start,end,10).map(p=>p.join(',')).join('L')} fill="none" stroke={active?color:'#a6b2a9'} strokeWidth="4"/>
   </g>;
  })}
  {[45,135,225,315].sort((a,b)=>Math.sin(rad(a+yaw))-Math.sin(rad(b+yaw))).map(angle=>{const x=272*Math.cos(rad(angle)),y=205*Math.sin(rad(angle)),base=project(x,y,0),top=project(x,y,125);return <g key={angle} className="stadium-floodlight" pointerEvents="none"><path d={`M${base.join(',')}L${top.join(',')}`} stroke="#85968a" strokeWidth="2"/><ellipse cx={top[0]} cy={top[1]} rx="23" ry="10" fill="#ebffd6" opacity=".3" filter={`url(#${uid}glow)`}/><rect x={top[0]-16} y={top[1]-4} width="32" height="9" rx="1" fill="#b8c8ad"/>{Array.from({length:6},(_,i)=><rect key={i} x={top[0]-14+i*5} y={top[1]-2} width="3" height="4" fill="#f6ffe1"/>)}</g>;})}
 </svg>;
},(a,b)=>a.selectedId===b.selectedId&&a.locked===b.locked&&a.yaw===b.yaw&&a.tilt===b.tilt&&a.zoom===b.zoom&&a.compact===b.compact&&a.onSelect===b.onSelect&&a.stands.length===b.stands.length&&a.stands.every((s,i)=>{const t=b.stands[i];return s.id===t.id&&s.name===t.name&&s.price===t.price&&s.available===t.available;}));

export function StadiumPicker({stands,selectedId,onSelect,locked=false,venue,compact=false}:Props){
 const [yaw,setYaw]=useState(-23),[tilt,setTilt]=useState(36),[zoom,setZoom]=useState(1),[activeView,setActiveView]=useState('3d');
 const dragging=useRef<{x:number;yaw:number;moved:boolean}|null>(null);
 const inventory=stands.length?stands:sampleStands;
 const latestSelect=useRef(onSelect);useEffect(()=>{latestSelect.current=onSelect;},[onSelect]);
 const selectStand=useCallback((id:string)=>latestSelect.current(id),[]);
 const current=inventory.find(s=>s.id===selectedId)||inventory[0];
 const move=(e:PointerEvent<HTMLDivElement>)=>{const p=dragging.current;if(!p)return;const delta=e.clientX-p.x;if(Math.abs(delta)>5)p.moved=true;if(p.moved){setYaw(p.yaw+delta*.35);setActiveView('custom');}};
 return <section className={'stadium-experience'+(compact?' stadium-compact':'')} aria-label={compact?'Explore the stadium':'Choose your stadium stand'}>
  <div className="stadium-topline"><span><i/> {compact?'THE MATCHDAY EXPERIENCE':'EXPLORE YOUR STADIUM'}</span><span className="stadium-live">INTERACTIVE 3D</span></div>
  <div className="stadium-viewport" onPointerDown={e=>{if(e.pointerType!=='mouse'||(e.target as Element).closest('[role="button"]'))return;dragging.current={x:e.clientX,yaw,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={()=>{dragging.current=null;}} onPointerCancel={()=>{dragging.current=null;}}>
   <div className="stadium-grid"/>
   <div className="stadium-orbit orbit-one"/><div className="stadium-orbit orbit-two"/>
   <StadiumModel stands={inventory} selectedId={current.id} onSelect={selectStand} locked={locked||!stands.length} yaw={yaw} tilt={tilt} zoom={zoom} compact={compact}/>
   <div className="stadium-coordinate">GROUND LEVEL<br/>360° EXPLORER<span>ILLUSTRATIVE MODEL</span></div>
   {!compact&&<div className="stadium-navigation"><button type="button" aria-label="Rotate stadium left" onClick={()=>{setYaw(v=>v-20);setActiveView('custom');}}>↶</button><button type="button" aria-label="Rotate stadium right" onClick={()=>{setYaw(v=>v+20);setActiveView('custom');}}>↷</button><span/><button type="button" aria-label="Zoom stadium out" disabled={zoom<=.8} onClick={()=>setZoom(v=>Math.max(.8,+(v-.1).toFixed(1)))}>−</button><button type="button" aria-label="Zoom stadium in" disabled={zoom>=1.2} onClick={()=>setZoom(v=>Math.min(1.2,+(v+.1).toFixed(1)))}>+</button><button type="button" aria-label="Reset stadium view" onClick={()=>{setYaw(-23);setTilt(36);setZoom(1);setActiveView('3d');}}>⟲</button></div>}
  </div>
  <div className="stadium-bottomline"><div><span className="stadium-venue">{venue}</span><span>{compact?'Your matchday. From a whole new angle.':'Select a highlighted stand to find your view.'}</span></div>{!compact&&<div className="stadium-view-toggle"><button aria-pressed={activeView==='3d'} onClick={()=>{setTilt(36);setYaw(-23);setActiveView('3d');}}>3D view</button><button aria-pressed={activeView==='top'} onClick={()=>{setTilt(88);setYaw(-90);setActiveView('top');}}>Top view</button></div>}</div>
  {!compact&&<><div className="stadium-legend">{inventory.map((s,i)=><button key={s.id} disabled={locked||s.available<1} aria-pressed={selectedId===s.id} onClick={()=>onSelect(s.id)}><i style={{background:palette[i%palette.length]}}/>{s.name}</button>)}<span>Drag the space around the stadium to rotate</span></div><p className="stadium-disclaimer">Illustrative stadium layout. Stand access only; individual seats are not assigned.</p></>}
 </section>;
}

export function StadiumStandCards({stands,selectedId,onSelect,locked=false}:{stands:Stand[];selectedId:string;onSelect:(id:string)=>void;locked?:boolean}){
 return <div className="stadium-stand-cards">{stands.map((stand,index)=><button key={stand.id} className={selectedId===stand.id?'selected':''} style={{'--stand-color':palette[index%palette.length]} as CSSProperties} aria-pressed={selectedId===stand.id} disabled={locked||stand.available<1} onClick={()=>onSelect(stand.id)}><div className="stand-card-top"><span className="stand-card-number">0{index+1}</span><span className="stand-card-check">{selectedId===stand.id?'✓':'↗'}</span></div><h3>{stand.name}</h3><p>{index===0?'Feel the energy of the crowd':index===1?'A closer view of every moment':'Make a little more of matchday'}</p><div className="stand-card-bottom"><b>{price(stand.price)}<small>/ ticket</small></b><span>{stand.available?`${stand.available} left`:'Sold out'}</span></div></button>)}</div>;
}
