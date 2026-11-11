(function(){
"use strict";
const $=id=>document.getElementById(id);
if(!$("news-feed"))return;
let stories=[],stamp=null,lastSuccess=null,summary=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const url=v=>{try{let x=new URL(v);return x.protocol==="https:"?x.href:null}catch{return null}};
function dateText(value){if(!value)return"Date unavailable";const d=new Date(value.length===10?value+"T12:00:00Z":value);return Number.isNaN(d.getTime())?"Date unavailable":new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",timeZone:"Australia/Sydney"}).format(d)}
function dateLabel(value){if(!value)return"No automated refresh yet";const d=new Date(value);return Number.isNaN(d.getTime())?"Date unavailable":new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Australia/Sydney",timeZoneName:"short"}).format(d)}
function filters(){return{region:$("news-region").value,topic:$("news-topic").value,source:$("news-source").value,q:$("news-search").value.trim().toLowerCase()}}
function visible(){let f=filters();return stories.filter(a=>(f.region==="all"||a.region===f.region)&&(f.topic==="all"||a.topic===f.topic)&&(f.source==="all"||a.source===f.source)&&[a.title,a.source,a.topic].join(" ").toLowerCase().includes(f.q))}
function card(a){const link=url(a.url);if(!link)return"";return '<article class="news-card"><div class="news-card-top"><span class="news-tag">'+esc(a.region)+'</span><span class="news-tag secondary">'+esc(a.topic)+'</span></div><h3>'+esc(a.title)+'</h3><div class="news-meta"><span>'+esc(a.source)+'</span><span>'+esc(dateText(a.published_at))+'</span></div><a href="'+esc(link)+'" class="news-read" target="_blank" rel="noopener noreferrer">Read full story at source</a></article>'}
function render(){
 const filtered=visible();
 $("news-results").innerHTML=filtered.map(card).join("")||'<div class="news-empty">No articles match those filters. Try another topic, publisher or region.</div>';
 $("news-showing").textContent=filtered.length;
 $("news-total").textContent=stories.length;
 $("news-act-count").textContent=stories.filter(a=>a.region==="Canberra").length;
 $("news-national-count").textContent=stories.filter(a=>a.region==="Australia").length;
 $("news-publisher-count").textContent=new Set(stories.map(a=>a.source)).size;
 $("news-updated").textContent=stamp?dateLabel(stamp):"Initial curated snapshot: "+(summary?.seeded_at||"date unavailable");
 $("news-source-status").textContent=summary?.feeds_checked?
 (summary.feeds_ok===null?"Automation configured; first successful refresh pending":
  summary.feeds_ok+" of "+summary.feeds_checked+" feeds retrieved in the last update") :
 "Curated public-source headlines";
}
function populate(){
 const currentSource=$("news-source").value;
 const sources=[...new Set(stories.map(a=>a.source))].sort((a,b)=>a.localeCompare(b));
 $("news-source").innerHTML='<option value="all">All publishers</option>'+sources.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
 $("news-source").value=sources.includes(currentSource)?currentSource:"all";
 const currentTopic=$("news-topic").value;
 const topics=[...new Set(stories.map(a=>a.topic))].sort();
 $("news-topic").innerHTML='<option value="all">All topics</option>'+topics.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
 $("news-topic").value=topics.includes(currentTopic)?currentTopic:"all";
}
async function loadNews(){
 const status=$("news-load-status");
 status.textContent="Checking published headlines…";
 $("news-refresh").disabled=true;
 try{
  const response=await fetch("./news.json?cache="+Date.now(),{cache:"no-store"});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const obj=await response.json();
  if(!obj||!Array.isArray(obj.articles))throw new Error("Unexpected feed format");
  const safe=obj.articles.filter(a=>a&&typeof a.title==="string"&&typeof a.source==="string"&&typeof a.url==="string"&&url(a.url));
  stories=safe.sort((a,b)=>(b.published_at||"").localeCompare(a.published_at||""));
  stamp=obj.updated_at||null;summary=obj;lastSuccess=Date.now();
  populate();render();
  status.textContent="Headlines link to their publishers. No full articles are copied.";
 }catch(e){
  status.textContent=stories.length?"Unable to retrieve a newer feed; showing the last loaded headlines.":"Unable to retrieve the news feed. You can still access the publishers from the source links below.";
  console.warn("News update issue",e);
 }finally{$("news-refresh").disabled=false}
}
["news-region","news-topic","news-source"].forEach(id=>$(id).addEventListener("change",render));
$("news-search").addEventListener("input",render);
$("news-refresh").addEventListener("click",loadNews);
loadNews();
})();
