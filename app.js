const $ = id => document.getElementById(id);
const API_BASE = "https://saudi-trading-agent.onrender.com";
const STORAGE_KEY = "saudi-agent-watchlist-v1";
let symbols = [];
let quoteCache = {};
let marketCache = null;
try { symbols = JSON.parse(localStorage.getItem(STORAGE_KEY) || '["2222"]'); } catch { symbols = ["2222"]; }
if (!Array.isArray(symbols)) symbols = ["2222"];
if (!symbols.length) symbols = ["2222"];
function persist(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols)); } catch {} }
function money(value){ return Number.isFinite(Number(value)) ? Number(value).toLocaleString("ar-SA",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"; }
function setStatus(title, detail, kind="neutral"){
  const box=$("data-notice"); box.dataset.kind=kind;
  $("data-status-title").textContent=title; $("data-status-detail").textContent=detail;
}
function renderMarket(){
  const d=marketCache?.data;
  if(!d) return;
  $("tasi-value").textContent=money(d.index_value);
  $("tasi-change").textContent=(Number(d.index_change)>=0?"+":"")+money(d.index_change)+" ("+(Number(d.index_change_percent)>=0?"+":"")+money(d.index_change_percent)+"%)";
  $("market-mood").textContent=d.market_mood==="Bullish"?"إيجابي":d.market_mood==="Bearish"?"سلبي":d.market_mood||"غير محدد";
  $("market-breadth").textContent=`مرتفع ${d.advancing ?? "—"} · منخفض ${d.declining ?? "—"} · ثابت ${d.unchanged ?? "—"}`;
  $("tasi-time").textContent="وقت بيانات المؤشر: "+(d.timestamp||"غير متاح");
}
function render(){
  const body=$("watch-list"); body.replaceChildren();
  if(!symbols.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="أضف رمز سهم لمتابعته.";tr.append(td);body.append(tr);return;}
  symbols.forEach(symbol=>{
    const tr=document.createElement("tr"),q=quoteCache[symbol]?.data;
    const values=[symbol,q?money(q.price):"—",q?(Number(q.change)>=0?"+":"")+money(q.change)+" ("+(Number(q.change_percent)>=0?"+":"")+money(q.change_percent)+"%)":"—",q?(q.is_delayed?"بيانات متأخرة":"حسب المزود"):"بانتظار البيانات"];
    values.forEach((value,i)=>{const td=document.createElement("td");td.textContent=value;if(i===2&&q)td.dir="ltr";tr.append(td);});
    const td=document.createElement("td"),btn=document.createElement("button");btn.className="remove";btn.type="button";btn.textContent="حذف";
    btn.addEventListener("click",()=>{symbols=symbols.filter(x=>x!==symbol);delete quoteCache[symbol];persist();render();});td.append(btn);tr.append(td);body.append(tr);
  });
}
async function getJSON(path){
  const response=await fetch(API_BASE+path,{headers:{Accept:"application/json"},cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||data.error||("HTTP "+response.status));
  return data;
}
async function refreshData(){
  const btn=$("refresh-data");btn.disabled=true;btn.textContent="جارٍ التحديث…";
  setStatus("جارٍ جلب البيانات","يتم الاتصال بخادم الوكيل ومزود SAHMK.","neutral");
  const results=await Promise.allSettled([
    getJSON("/api/market/summary"),
    ...symbols.map(symbol=>getJSON("/api/quote/"+encodeURIComponent(symbol)))
  ]);
  const marketResult=results[0];
  if(marketResult.status==="fulfilled"){marketCache=marketResult.value;renderMarket();}
  let goodQuotes=0, delayed=Boolean(marketCache?.data?.is_delayed);
  symbols.forEach((symbol,i)=>{
    const result=results[i+1];
    if(result?.status==="fulfilled"){quoteCache[symbol]=result.value;goodQuotes++;delayed=delayed||Boolean(result.value.data?.is_delayed);}
    else {delete quoteCache[symbol];}
  });
  render();
  const now=new Date().toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"medium"});
  $("last-retrieved").textContent="آخر جلب من خادم الوكيل: "+now;
  const failures=results.filter(r=>r.status==="rejected").length;
  if(marketResult.status==="fulfilled"&&goodQuotes===symbols.length){
    setStatus(delayed?"الاتصال ناجح — البيانات متأخرة":"الاتصال ناجح — تحقق من توقيت كل سعر",delayed?"وصلت البيانات من SAHMK، لكن المزود يعلّم بعض/كل القراءات بأنها متأخرة. لا توجد توصيات دخول.":"وصلت البيانات. راجع وقت تحديث المزود لكل سهم قبل اتخاذ أي قرار.","warning");
  }else{
    setStatus("بيانات غير مكتملة",`نجح جلب ${goodQuotes} من ${symbols.length} أسهم. ${failures} طلبات تعذرت. لا توجد توصيات دخول.`,"error");
  }
  $("refresh-data").disabled=false;btn.textContent="تحديث البيانات";
}
$("watch-form").addEventListener("submit",event=>{
  event.preventDefault();const input=$("symbol"),symbol=input.value.trim();
  if(!/^\d{4,5}$/.test(symbol)){input.setCustomValidity("أدخل رمز تداول من 4 أو 5 أرقام.");input.reportValidity();return;}
  input.setCustomValidity("");if(!symbols.includes(symbol)){symbols.push(symbol);persist();render();refreshData();}input.value="";
});
$("symbol").addEventListener("input",()=> $("symbol").setCustomValidity(""));
$("refresh-data").addEventListener("click",refreshData);
$("calculate").addEventListener("click",()=>{
  const capital=Number($("capital").value),risk=Number($("risk").value),entry=Number($("entry").value),stop=Number($("stop").value),out=$("result");
  if(![capital,risk,entry,stop].every(Number.isFinite)||capital<=0||risk<=0||risk>5||entry<=0||stop<=0||stop>=entry){out.textContent="تحقق من القيم: وقف الخسارة يجب أن يكون أقل من الدخول، والمخاطرة بين 0.1% و5%.";return;}
  const riskCash=capital*risk/100,perShare=entry-stop,qty=Math.floor(riskCash/perShare),value=qty*entry;
  out.textContent=qty>0?`الكمية النظرية: ${qty.toLocaleString("ar-SA")} سهم. قيمة المركز: ${value.toLocaleString("ar-SA",{maximumFractionDigits:2})} ريال. الخسارة الحسابية عند الوقف: ${(qty*perShare).toLocaleString("ar-SA",{maximumFractionDigits:2})} ريال. لا تشمل العمولات أو الانزلاق، وتأكد من كفاية رأس المال.`:"المخاطرة المحددة لا تكفي لشراء سهم واحد.";
});
if("serviceWorker" in navigator && location.protocol.startsWith("http")) addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
render();
refreshData();
