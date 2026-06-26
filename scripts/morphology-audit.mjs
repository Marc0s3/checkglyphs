import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const enginePath = join(root, 'src/checkglyphs.js');

function parseColor(value) {
  const input = String(value || '').trim().toLowerCase();
  const named = { black:'#000000', white:'#ffffff', red:'#ff0000', green:'#008000', blue:'#0000ff', gray:'#808080', grey:'#808080' };
  const text = named[input] || input;
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return { r:Math.round(+rgb[1]), g:Math.round(+rgb[2]), b:Math.round(+rgb[3]) };
  const hexm = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!hexm) throw new Error(`Unsupported color ${value}`);
  let hex = hexm[1];
  if (hex.length===3 || hex.length===4) hex = hex.slice(0,3).split('').map(c=>c+c).join('');
  else hex = hex.slice(0,6);
  return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16) };
}

function context() {
  return vm.createContext({
    console, TextDecoder, TextEncoder, Uint8Array, atob, setTimeout, clearTimeout,
    max:Math.max, min:Math.min, floor:Math.floor, ceil:Math.ceil, round:Math.round,
    abs:Math.abs, pow:Math.pow, sqrt:Math.sqrt, constrain:(v,l,h)=>Math.min(h,Math.max(l,v)),
    lerp:(a,b,t)=>a+(b-a)*t, color:parseColor, red:v=>v.r, green:v=>v.g, blue:v=>v.b
  });
}

const ctx = context();
vm.runInContext(await readFile(enginePath,'utf8'), ctx, {filename:enginePath});
vm.runInContext(`
function __mkCheck(input, rawOrder=0) {
  const colors = input.colors.slice();
  const keyTimes = input.keyTimes.slice();
  const c = {
    x: input.x || 0, y: input.y || 0, sourceX: input.x || 0, sourceY: input.y || 0,
    sourceScale: input.scale == null ? 1 : input.scale, row:0, col:0,
    colors, keyTimes, rawColors: colors.slice(), rawKeyTimes:keyTimes.slice(),
    initialFill: input.initialFill || colors[0], rawOrder,
    exactSignature:'', word:'', metrics:null, identity:null, initialColor:''
  };
  c.exactSignature = computeExactTrackSignature(c);
  c.word = computeColorWord(c.colors);
  c.metrics = computeMetrics(c);
  c.identity = buildCheckIdentity(c);
  c.initialColor = getInitialCheckColor(c);
  return c;
}
function __one(input, opts={}) {
  loadedTokenId = String(opts.tokenId ?? '1');
  loadedTraits = { speed:opts.speed ?? 'Medium', shift:opts.shift ?? 'UV', gradient:opts.gradient ?? 'Linear', all:{} };
  const c = __mkCheck(input, opts.rawOrder ?? 0);
  const g = buildGlyphData(c, opts.collisionAttempt ?? 0);
  return { metrics:c.metrics, exactSignature:c.exactSignature, profile:g.profile, visibleIndices:g.visibleIndices, traversal:g.traversal, originIndex:g.originIndex, familyId:g.familyId, inflectionId:g.inflectionId };
}
function __many(specs) { return specs.map(s => __one(s.input, s.opts || {})); }
function __group(inputs, opts={}) {
  loadedTokenId = String(opts.tokenId ?? '1');
  loadedTraits = { speed:opts.speed ?? 'Medium', shift:opts.shift ?? 'UV', gradient:opts.gradient ?? 'Linear', all:{} };
  const used = new Set();
  return inputs.map((input,i)=>{
    const c = __mkCheck(input, i);
    const s = selectGlyphDataWithoutCollision(c, used);
    const g = s.glyphData;
    return { metrics:c.metrics, exactSignature:c.exactSignature, profile:g.profile, visibleIndices:g.visibleIndices, traversal:g.traversal, originIndex:g.originIndex, collisionAttempt:s.collisionAttempt };
  });
}
`, ctx);

function many(specs) { ctx.__specs=specs; const out=vm.runInContext('__many(__specs)',ctx); delete ctx.__specs; return JSON.parse(JSON.stringify(out)); }
function one(input, opts={}) { return many([{input,opts}])[0]; }
function group(inputs, opts={}) { ctx.__inputs=inputs; ctx.__opts=opts; const out=vm.runInContext('__group(__inputs,__opts)',ctx); delete ctx.__inputs; delete ctx.__opts; return JSON.parse(JSON.stringify(out)); }

function xorshift(seed=123456789) { let x=seed>>>0; return ()=>{ x ^= x<<13; x ^= x>>>17; x ^= x<<5; return (x>>>0)/4294967296; }; }
const rnd=xorshift(0x5eedc0de);
const rint=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const hex=n=>n.toString(16).padStart(2,'0');
const randomColor=()=>`#${hex(rint(0,255))}${hex(rint(0,255))}${hex(rint(0,255))}`;
function randomTrack() {
  const n=rint(1,9); const colors=[]; for(let i=0;i<n;i++) colors.push(randomColor());
  if(n>=3 && rnd()<0.28) colors[colors.length-1]=colors[0];
  const keyTimes=[0];
  if(n===1) return {colors,keyTimes:[0],initialFill:colors[0]};
  const cuts=[]; for(let i=0;i<n-2;i++) cuts.push(rnd()); cuts.sort((a,b)=>a-b);
  keyTimes.push(...cuts,1);
  return {colors,keyTimes,initialFill:colors[0]};
}
function perturbRGB(track) {
  const t=JSON.parse(JSON.stringify(track)); const i=rint(0,t.colors.length-1); const c=parseColor(t.colors[i]); const channel=['r','g','b'][rint(0,2)];
  const delta=rnd()<0.5?-1:1; c[channel]=Math.max(0,Math.min(255,c[channel]+delta));
  t.colors[i]=`#${hex(c.r)}${hex(c.g)}${hex(c.b)}`; if(i===0) t.initialFill=t.colors[0]; return t;
}
function perturbTime(track) {
  const t=JSON.parse(JSON.stringify(track)); if(t.keyTimes.length<3) return perturbRGB(track);
  const i=rint(1,t.keyTimes.length-2); const lo=t.keyTimes[i-1], hi=t.keyTimes[i+1]; const d=rnd()<0.5?-0.001:0.001;
  t.keyTimes[i]=Math.max(lo,Math.min(hi,t.keyTimes[i]+d)); return t;
}
function mask(indices){ let m=0; for(const i of indices) m|=(1<<i); return m>>>0; }
function popcount(x){ x>>>=0; x=x-((x>>>1)&0x55555555); x=(x&0x33333333)+((x>>>2)&0x33333333); return (((x+(x>>>4))&0x0F0F0F0F)*0x01010101)>>>24; }
function shapeMetrics(indices) {
  const set=new Set(indices), pts=indices.map(i=>({x:i%5,y:Math.floor(i/5)}));
  let components=0, isolated=0, endpoints=0, orthEdges=0, diagEdges=0;
  const rem=new Set(indices);
  const neigh=i=>{const x=i%5,y=Math.floor(i/5),a=[]; if(x)a.push(i-1); if(x<4)a.push(i+1); if(y)a.push(i-5); if(y<4)a.push(i+5); return a;};
  for(const i of indices){ const d=neigh(i).filter(n=>set.has(n)).length; if(d===0)isolated++; if(d===1)endpoints++; orthEdges+=d; const x=i%5,y=Math.floor(i/5); for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,yy=y+dy; if(xx>=0&&xx<5&&yy>=0&&yy<5&&set.has(yy*5+xx))diagEdges++;}}
  orthEdges/=2; diagEdges/=2;
  while(rem.size){components++; const s=[rem.values().next().value]; rem.delete(s[0]); while(s.length){const c=s.pop(); for(const n of neigh(c))if(rem.has(n)){rem.delete(n);s.push(n);}}}
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  let xx=0,yy=0,xy=0; for(const p of pts){const dx=p.x-cx,dy=p.y-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;} xx/=pts.length;yy/=pts.length;xy/=pts.length;
  const tr=xx+yy, det=xx*yy-xy*xy, disc=Math.sqrt(Math.max(0,tr*tr/4-det)); const l1=tr/2+disc,l2=tr/2-disc;
  let angle=0.5*Math.atan2(2*xy,xx-yy)*180/Math.PI; if(angle<0)angle+=180;
  const elong=l2<1e-9?(l1>0?99:1):l1/l2; const diagDist=Math.min(Math.abs(angle-45),Math.abs(angle-135));
  const vert=indices.every(i=>set.has(Math.floor(i/5)*5+(4-(i%5))));
  const horiz=indices.every(i=>set.has((4-Math.floor(i/5))*5+(i%5)));
  const rot=indices.every(i=>set.has(24-i));
  return {count:indices.length,components,isolated,endpoints,orthEdges,diagEdges,cx,cy,balanceX:Math.abs(cx-2),balanceY:Math.abs(cy-2),vert,horiz,rot,angle,elong,diagonalDominant:elong>=2.2&&diagDist<=15};
}
function jaccard(a,b){const A=new Set(a),B=new Set(b);let inter=0;for(const x of A)if(B.has(x))inter++;return inter/(A.size+B.size-inter);}
function summary(vals){const s=vals.slice().sort((a,b)=>a-b); const q=p=>s[Math.min(s.length-1,Math.floor(p*(s.length-1)))]; return {n:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,min:s[0],p10:q(.1),p25:q(.25),median:q(.5),p75:q(.75),p90:q(.9),max:s[s.length-1]};}
function counts(arr,key){const o={};for(const x of arr){const k=typeof key==='function'?key(x):x[key];o[k]=(o[k]||0)+1;}return Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]));}

const traits=[['Slow','UV','Linear'],['Medium','UV','Radial'],['Fast','IR','Noise'],['Medium','IR','Spiral']];
const N=1000;
const randomSpecs=[];
for(let i=0;i<N;i++){const t=randomTrack(), tr=traits[i%traits.length]; randomSpecs.push({input:t,opts:{tokenId:String(100000+i),rawOrder:0,speed:tr[0],shift:tr[1],gradient:tr[2]}});}
const random=many(randomSpecs);
const sms=random.map(g=>shapeMetrics(g.visibleIndices));
const pathMetrics=random.map(g=>{let jumps=0,maxJump=0;for(let i=1;i<g.traversal.length;i++){const a=g.traversal[i-1],b=g.traversal[i],d=Math.abs(a%5-b%5)+Math.abs(Math.floor(a/5)-Math.floor(b/5));if(d>1)jumps++;if(d>maxJump)maxJump=d;}return{jumps,maxJump,origin:g.originIndex,originRow:Math.floor(g.originIndex/5)};});
const familyQuality={};
random.forEach((g,i)=>{const f=g.profile.family,q=familyQuality[f]??={n:0,multi:0,isolated:0,cellSum:0,vertical:0,jump:0};const m=sms[i];q.n++;q.multi+=m.components>1;q.isolated+=m.isolated>0;q.cellSum+=m.count;q.vertical+=m.vert;q.jump+=pathMetrics[i].jumps>0;});
for(const q of Object.values(familyQuality)){q.multiComponentRate=q.multi/q.n;q.isolatedRate=q.isolated/q.n;q.meanCells=q.cellSum/q.n;q.exactVerticalRate=q.vertical/q.n;q.traversalJumpRate=q.jump/q.n;delete q.multi;delete q.isolated;delete q.cellSum;delete q.vertical;delete q.jump;}
const occ=Array(25).fill(0); random.forEach(g=>g.visibleIndices.forEach(i=>occ[i]++));
const sigCounts=counts(random,g=>g.visibleIndices.join(','));
const uniqueMasks=[...new Set(random.map(g=>mask(g.visibleIndices)))];
const nearest=[];
for(let i=0;i<uniqueMasks.length;i++){
  let best=25; for(let j=0;j<uniqueMasks.length;j++){if(i===j)continue; const d=popcount(uniqueMasks[i]^uniqueMasks[j]); if(d<best){best=d;if(best===1)break;}}
  nearest.push(best);
}

const baseTrack={initialFill:'#ff5c35',colors:['#ff5c35','#f7d154','#5ac8fa','#5856d6','#ff5c35'],keyTimes:[0,.2,.55,.82,1]};
const sameIdentityA=one(baseTrack,{tokenId:'1',rawOrder:0,speed:'Slow',shift:'UV',gradient:'Linear'});
const sameIdentityB=one(baseTrack,{tokenId:'1',rawOrder:0,speed:'Slow',shift:'UV',gradient:'Linear'});
const identityVariants=many(Array.from({length:300},(_,i)=>({input:baseTrack,opts:{tokenId:String(1+i),rawOrder:i%80,speed:'Slow',shift:'UV',gradient:'Linear'}})));
const repeated=group(Array.from({length:80},()=>({initialFill:'#f2f2f2',colors:['#f2f2f2'],keyTimes:[0]})),{tokenId:'7777',speed:'Medium',shift:'UV',gradient:'Linear'});
const uniformBandTrack={initialFill:'#ef3e44',colors:['#ef3e44','#ffb23f','#f5db4d','#69d68a','#55c5dc','#5858b8','#d63384','#ef3e44'],keyTimes:[0,.11,.25,.39,.55,.7,.86,1]};
const uniformBand=group(Array.from({length:80},()=>uniformBandTrack),{tokenId:'23002',speed:'Medium',shift:'UV',gradient:'Linear'});

const P=200, rgbPairs=[], timePairs=[];
const pairSpecs=[];
for(let i=0;i<P;i++){
  const t=randomTrack(); const tr=traits[i%traits.length]; const opts={tokenId:String(70000+i),rawOrder:0,speed:tr[0],shift:tr[1],gradient:tr[2]};
  pairSpecs.push({input:t,opts},{input:perturbRGB(t),opts},{input:perturbTime(t),opts});
}
const pairGlyphs=many(pairSpecs);
for(let i=0;i<P;i++){
  const a=pairGlyphs[i*3], b=pairGlyphs[i*3+1], c=pairGlyphs[i*3+2];
  rgbPairs.push({h:popcount(mask(a.visibleIndices)^mask(b.visibleIndices)),j:jaccard(a.visibleIndices,b.visibleIndices),sameFamily:a.profile.family===b.profile.family,sameProfile:a.profile.family===b.profile.family&&a.profile.symmetryMode===b.profile.symmetryMode&&a.profile.densityLevel===b.profile.densityLevel&&a.profile.interiorMode===b.profile.interiorMode});
  timePairs.push({h:popcount(mask(a.visibleIndices)^mask(c.visibleIndices)),j:jaccard(a.visibleIndices,c.visibleIndices),sameFamily:a.profile.family===c.profile.family,sameProfile:a.profile.family===c.profile.family&&a.profile.symmetryMode===c.profile.symmetryMode&&a.profile.densityLevel===c.profile.densityLevel&&a.profile.interiorMode===c.profile.interiorMode});
}
const unrelatedPairs=[];
for(let i=0;i<P;i++){
  const a=random[i], b=random[N-1-i];
  unrelatedPairs.push({h:popcount(mask(a.visibleIndices)^mask(b.visibleIndices)),j:jaccard(a.visibleIndices,b.visibleIndices),sameFamily:a.profile.family===b.profile.family,sameProfile:a.profile.family===b.profile.family&&a.profile.symmetryMode===b.profile.symmetryMode&&a.profile.densityLevel===b.profile.densityLevel&&a.profile.interiorMode===b.profile.interiorMode});
}

const tokenGroupRuns=[];
for(let gi=0;gi<5;gi++){
  const tr=traits[gi%traits.length];
  const glyphs=group(Array.from({length:80},()=>randomTrack()),{tokenId:String(900000+gi),speed:tr[0],shift:tr[1],gradient:tr[2]});
  const signatures=glyphs.map(g=>g.visibleIndices.join(','));
  let near2=0;
  for(let i=0;i<glyphs.length;i++) for(let j=i+1;j<glyphs.length;j++) if(popcount(mask(glyphs[i].visibleIndices)^mask(glyphs[j].visibleIndices))<=2) near2++;
  tokenGroupRuns.push({unique:new Set(signatures).size,attempts:glyphs.map(g=>g.collisionAttempt),near2});
}

const byTrackClass={};
for(const g of random){const k=g.profile.trackClass;(byTrackClass[k]??=[]).push(g);}
const classSummaries=Object.fromEntries(Object.entries(byTrackClass).map(([k,v])=>[k,{n:v.length,families:counts(v,g=>g.profile.family),symmetries:counts(v,g=>g.profile.symmetryMode),density:counts(v,g=>g.profile.densityLevel)}]));

const result={
  engine:{glyphEngine:'2.3',dnaSchema:'2.3',randomSample:N,perturbationPairs:P},
  deterministic:{sameIdentityExact:JSON.stringify(sameIdentityA)===JSON.stringify(sameIdentityB)},
  randomMorphology:{
    uniqueSilhouettes:Object.keys(sigCounts).length, exactCollisionRate:1-Object.keys(sigCounts).length/N,
    mostCommonSilhouettes:Object.entries(sigCounts).slice(0,20), nearestHamming:summary(nearest),
    family:counts(random,g=>g.profile.family), symmetry:counts(random,g=>g.profile.symmetryMode), density:counts(random,g=>g.profile.densityLevel), interior:counts(random,g=>g.profile.interiorMode),
    cellCount:summary(sms.map(x=>x.count)), sparseGlyphRate:sms.filter(x=>x.count<=4).length/N, compactGlyphRate:sms.filter(x=>x.count<=6).length/N, components:counts(sms,x=>x.components), familyQuality, originRows:counts(pathMetrics,x=>x.originRow), traversalJumpGlyphRate:pathMetrics.filter(x=>x.jumps>0).length/N, traversalJumps:summary(pathMetrics.map(x=>x.jumps)), maxTraversalJump:summary(pathMetrics.map(x=>x.maxJump)), isolatedGlyphRate:sms.filter(x=>x.isolated>0).length/N,
    diagonalDominantRate:sms.filter(x=>x.diagonalDominant).length/N, exactVerticalShapeRate:sms.filter(x=>x.vert).length/N,
    exactHorizontalShapeRate:sms.filter(x=>x.horiz).length/N, rotationalShapeRate:sms.filter(x=>x.rot).length/N,
    balanceX:summary(sms.map(x=>x.balanceX)), balanceY:summary(sms.map(x=>x.balanceY)),
    occupancy:occ.map(x=>x/N), classSummaries
  },
  semanticStability:{
    oneRgbUnit:{hamming:summary(rgbPairs.map(x=>x.h)),jaccard:summary(rgbPairs.map(x=>x.j)),sameFamilyRate:rgbPairs.filter(x=>x.sameFamily).length/P,sameFullProfileRate:rgbPairs.filter(x=>x.sameProfile).length/P,identicalShapeRate:rgbPairs.filter(x=>x.h===0).length/P},
    oneMillisecondNormalizedTiming:{hamming:summary(timePairs.map(x=>x.h)),jaccard:summary(timePairs.map(x=>x.j)),sameFamilyRate:timePairs.filter(x=>x.sameFamily).length/P,sameFullProfileRate:timePairs.filter(x=>x.sameProfile).length/P,identicalShapeRate:timePairs.filter(x=>x.h===0).length/P},
    unrelatedTracks:{hamming:summary(unrelatedPairs.map(x=>x.h)),jaccard:summary(unrelatedPairs.map(x=>x.j)),sameFamilyRate:unrelatedPairs.filter(x=>x.sameFamily).length/P,sameFullProfileRate:unrelatedPairs.filter(x=>x.sameProfile).length/P,identicalShapeRate:unrelatedPairs.filter(x=>x.h===0).length/P}
  },
  identityDependence:{sameChromaticTrackAcross300Identities:{uniqueSilhouettes:new Set(identityVariants.map(g=>g.visibleIndices.join(','))).size,family:counts(identityVariants,g=>g.profile.family),profileUnique:new Set(identityVariants.map(g=>[g.profile.family,g.profile.symmetryMode,g.profile.densityLevel,g.profile.interiorMode].join('|'))).size,hammingFromFirst:summary(identityVariants.slice(1).map(g=>popcount(mask(identityVariants[0].visibleIndices)^mask(g.visibleIndices))))}},
  withinTokenRandom80:{groups:tokenGroupRuns.length,residualDuplicateGroups:tokenGroupRuns.filter(g=>g.unique<80).length,uniquePerGroup:summary(tokenGroupRuns.map(g=>g.unique)),collisionAttempts:counts(tokenGroupRuns.flatMap(g=>g.attempts),x=>x),nearHammingLE2PerGroup:summary(tokenGroupRuns.map(g=>g.near2))},
  monochrome80:{uniqueSilhouettes:new Set(repeated.map(g=>g.visibleIndices.join(','))).size,collisionAttempts:counts(repeated,g=>g.collisionAttempt),fieldFamilies:counts(repeated,g=>g.profile.fieldFamily),realizedFamilies:counts(repeated,g=>g.profile.family),symmetries:counts(repeated,g=>g.profile.symmetryMode),cellCount:summary(repeated.map(g=>g.visibleIndices.length)),nearPairs:(()=>{let c1=0,c2=0,total=0;for(let i=0;i<80;i++)for(let j=i+1;j<80;j++){total++;const d=popcount(mask(repeated[i].visibleIndices)^mask(repeated[j].visibleIndices));if(d<=1)c1++;if(d<=2)c2++;}return{total,hammingLE1:c1,hammingLE2:c2};})()},
  uniformChromaticBand80:{uniqueSilhouettes:new Set(uniformBand.map(g=>g.visibleIndices.join(','))).size,collisionAttempts:counts(uniformBand,g=>g.collisionAttempt),fieldFamilies:counts(uniformBand,g=>g.profile.fieldFamily),realizedFamilies:counts(uniformBand,g=>g.profile.family),symmetries:counts(uniformBand,g=>g.profile.symmetryMode),density:counts(uniformBand,g=>g.profile.densityLevel),components:counts(uniformBand,g=>shapeMetrics(g.visibleIndices).components),isolatedGlyphRate:uniformBand.filter(g=>shapeMetrics(g.visibleIndices).isolated>0).length/80,sparseGlyphCount:uniformBand.filter(g=>g.visibleIndices.length<=4).length,compactGlyphCount:uniformBand.filter(g=>g.visibleIndices.length<=6).length,developedGlyphCount:uniformBand.filter(g=>g.visibleIndices.length>=8).length,cellCount:summary(uniformBand.map(g=>g.visibleIndices.length))}
};

const auditDir = join(root, 'audit');
await mkdir(auditDir, { recursive: true });
await writeFile(join(auditDir,'morphology-audit-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
