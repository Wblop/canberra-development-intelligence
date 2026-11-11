(function(){
'use strict';
const data=window.CDI_ACQUISITION;
const root=document.getElementById('acquisition');
if(!data||!root)return;
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dims=data.dimensions;
let selected=null;
const W={planning:30,demand:25,transport:20,amenities:15,infrastructure:10};
const moneyLabel=(n)=>Number(n).toFixed(0);
function currentWeights(){const total=Object.values(W).reduce((a,b)=>a+b,0);return dims.map(d=>total===0?1/dims.length:W[d.key]/total)}
function score(area){let w=currentWeights();return Math.round(area.scores.reduce((sum,x,i)=>sum+x*w[i],0)/5*100)}
function filters(){return {state:document.getElementById('acq-state').value,product:document.getElementById('acq-product').value,q:document.getElementById('acq-search').value.toLowerCase().trim()}}
function visible(){const f=filters();return data.candidates.filter(c=>(f.state==='all'||c.state===f.state)&&(f.product==='all'||c.type.includes(f.product))&&[c.name,c.city,c.state,c.signal,c.angle].join(' ').toLowerCase().includes(f.q)).map(c=>({...c,screeningScore:score(c)})).sort((a,b)=>b.screeningScore-a.screeningScore||a.name.localeCompare(b.name))}
function sourceList(c){return c.sources.map(a=>'<a class="acq-source" href="'+E(a.url)+'" rel="noopener noreferrer" target="_blank">'+E(a.label)+'</a>').join('')}
function card(c,i){return '<article class="acq-result">'+
 '<div class="acq-result-main"><div class="acq-position">'+String(i+1).padStart(2,'0')+'</div><div class="acq-result-copy">'+
 '<div class="acq-kicker">'+E(c.state)+' / '+E(c.city)+' / '+E(c.type.map(t=>({infill:'APARTMENTS',greenfield:'COMMUNITIES',mixed:'MIXED-USE'}[t])).join(' · '))+'</div>'+
 '<h3>'+E(c.name)+'</h3><p>'+E(c.signal)+'</p><div class="acq-pop"><strong>DEMAND CONTEXT</strong> '+E(c.population)+'</div>'+
 '</div><div class="acq-result-right"><small>ILLUSTRATIVE INDEX</small><strong>'+c.screeningScore+'<span>/100</span></strong>'+
 '<div class="acq-mini-track"><div style="width:'+c.screeningScore+'%"></div></div>'+
 '<button class="acq-inspect" data-acq="'+E(c.id)+'" aria-expanded="'+(selected===c.id)+'">'+(selected===c.id?'Hide research':'View research')+'</button></div></div>'+
 (selected===c.id?'<div class="acq-expanded"><div><div class="acq-hint">WHY IT IS WORTH REVIEWING</div><p>'+E(c.angle)+'</p><div class="acq-hint">PARCEL-LEVEL QUESTIONS TO CHECK</div><p>'+E(c.watch)+'</p><div class="acq-hint">ORIGINAL PUBLIC SOURCES</div><div class="acq-sources">'+sourceList(c)+'</div></div>'+
 '<div class="acq-factors"><div class="acq-hint">ILLUSTRATIVE 1–5 DIMENSION RATINGS</div>'+dims.map((d,j)=>'<div class="acq-factor"><div><span>'+E(d.name)+'</span><strong>'+c.scores[j]+'/5</strong></div><div class="acq-factor-track"><div style="width:'+c.scores[j]*20+'%"></div></div></div>').join('')+'<p>These ratings are analyst assumptions, not official data or site-specific assessments.</p></div></div>':'')+
 '</article>'}
function render(){
 const arr=visible();
 document.getElementById('acq-count').textContent=arr.length;
 document.getElementById('acq-results').innerHTML=arr.map(card).join('')||'<div class="acq-nothing">No precincts match these filters. Try another state or development strategy.</div>';
 document.getElementById('acq-method-summary').textContent='Weights: '+dims.map(d=>d.name+' '+W[d.key]).join(' / ')+' (normalised to 100%)';
 const fav=arr[0];
 document.getElementById('acq-top').innerHTML=fav?
 '<span class="acq-top-label">TOP SCREENING MATCH FOR YOUR SELECTED WEIGHTS</span><strong>'+E(fav.name)+'</strong><span>'+E(fav.state)+' · illustrative index '+fav.screeningScore+'/100</span>':
 '<span class="acq-top-label">NO MATCHING PRECINCTS</span>';
}
document.getElementById('acq-state').addEventListener('change',()=>{selected=null;render()});
document.getElementById('acq-product').addEventListener('change',()=>{selected=null;render()});
document.getElementById('acq-search').addEventListener('input',()=>{selected=null;render()});
const groups=document.getElementById('acq-weights');
groups.innerHTML=dims.map((d,i)=>'<div class="acq-weight"><div class="acq-weight-top"><label for="acq-weight-'+E(d.key)+'">'+E(d.name)+'</label><output id="acq-value-'+E(d.key)+'">'+W[d.key]+'</output></div><input id="acq-weight-'+E(d.key)+'" type="range" min="0" max="50" step="5" value="'+W[d.key]+'" aria-label="'+E(d.name)+' weighting"><p>'+E(d.help)+'</p></div>').join('');
groups.addEventListener('input',e=>{const k=e.target?.id?.replace('acq-weight-','');if(!dims.some(d=>d.key===k))return;W[k]=Number(e.target.value);document.getElementById('acq-value-'+k).textContent=W[k];render()});
document.getElementById('acq-reset').addEventListener('click',()=>{Object.assign(W,{planning:30,demand:25,transport:20,amenities:15,infrastructure:10});dims.forEach(d=>{document.getElementById('acq-weight-'+d.key).value=W[d.key];document.getElementById('acq-value-'+d.key).textContent=W[d.key]});render()});
document.getElementById('acq-results').addEventListener('click',e=>{const b=e.target.closest('[data-acq]');if(!b)return;selected=selected===b.dataset.acq?null:b.dataset.acq;render();document.querySelector('[data-acq="'+b.dataset.acq+'"]')?.focus()});
document.getElementById('acq-export').addEventListener('click',()=>{const arr=visible(),w=currentWeights();
 const rows=[['Precinct','State','City','Development strategies','Illustrative screening index /100',...dims.map((d,i)=>d.name+' assumption /5'),...dims.map((d,i)=>d.name+' normalised weighting'),'Population context','Planning and infrastructure signal','Key verification questions','Sources'],...arr.map(a=>[a.name,a.state,a.city,a.type.join(' | '),a.screeningScore,...a.scores,...w.map(n=>Math.round(n*100)+'%'),a.population,a.signal,a.watch,a.sources.map(s=>s.url).join(' | ')])];
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='australian-land-acquisition-screening.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
});
document.getElementById('acq-state').innerHTML='<option value="all">All states</option>'+[...new Set(data.candidates.map(c=>c.state))].sort().map(x=>'<option>'+E(x)+'</option>').join('');
document.getElementById('acq-date').textContent=data.asOf;
render();
})();