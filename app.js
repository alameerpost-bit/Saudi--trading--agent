const $ = id => document.getElementById(id);
const STORAGE_KEY = "saudi-agent-watchlist-v1";
let symbols = [];
try { symbols = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch {}
function persist(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols)); } catch {} }
function render(){
  const body = $("watch-list"); body.replaceChildren();
  if(!symbols.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="لا توجد أسهم في القائمة بعد. الأسعار غير متاحة حتى ربط مزود بيانات.";tr.append(td);body.append(tr);return;}
  symbols.forEach(symbol=>{
    const tr=document.createElement("tr");
    [symbol,"—","—","غير متصل"].forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});
    const td=document.createElement("td"),btn=document.createElement("button");btn.className="remove";btn.type="button";btn.textContent="حذف";
    btn.addEventListener("click",()=>{symbols=symbols.filter(x=>x!==symbol);persist();render();});td.append(btn);tr.append(td);body.append(tr);
  });
}
$("watch-form").addEventListener("submit",event=>{
  event.preventDefault();const input=$("symbol"),symbol=input.value.trim();
  if(!/^\d{3,6}$/.test(symbol)){input.setCustomValidity("أدخل رمزًا رقميًا من 3 إلى 6 أرقام.");input.reportValidity();return;}
  input.setCustomValidity("");if(!symbols.includes(symbol)){symbols.push(symbol);persist();render();}input.value="";
});
$("symbol").addEventListener("input",()=> $("symbol").setCustomValidity(""));
$("calculate").addEventListener("click",()=>{
  const capital=Number($("capital").value),risk=Number($("risk").value),entry=Number($("entry").value),stop=Number($("stop").value),out=$("result");
  if(![capital,risk,entry,stop].every(Number.isFinite)||capital<=0||risk<=0||risk>5||entry<=0||stop<=0||stop>=entry){out.textContent="تحقق من القيم: وقف الخسارة يجب أن يكون أقل من الدخول، والمخاطرة بين 0.1% و5%.";return;}
  const riskCash=capital*risk/100,perShare=entry-stop,qty=Math.floor(riskCash/perShare),value=qty*entry;
  out.textContent=qty>0?`الكمية النظرية: ${qty.toLocaleString("ar-SA")} سهم. قيمة المركز: ${value.toLocaleString("ar-SA",{maximumFractionDigits:2})} ريال. الخسارة الحسابية عند الوقف: ${(qty*perShare).toLocaleString("ar-SA",{maximumFractionDigits:2})} ريال. لا تشمل العمولات أو الانزلاق، وتأكد من كفاية رأس المال.`:"المخاطرة المحددة لا تكفي لشراء سهم واحد.";
});
if("serviceWorker" in navigator && location.protocol.startsWith("http")) addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
render();
