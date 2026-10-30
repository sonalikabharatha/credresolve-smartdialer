const api = (path, options={}) => fetch(`/api${path}`, {
  headers: {"Content-Type":"application/json"}, ...options
}).then(async r => { const data=await r.json(); if(!r.ok) throw new Error(data.error || "Request failed"); return data; });
const el = id => document.getElementById(id);
function toast(message){const t=el("toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)}
function stateBadge(state){return `<span class="state ${state}">${state}</span>`}
async function refreshAll(){
  try{
    const [m,a,b,c]=await Promise.all([api("/metrics"),api("/agents"),api("/borrowers"),api("/calls")]);
    for(const key of ["totalAgents","availableAgents","utilization","totalCalls","completedCalls","failedCalls"]) el(key).textContent=key==="utilization"?`${m[key]}%`:m[key];
    el("agentsBody").innerHTML=a.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${stateBadge(x.state)}</td><td>${["AVAILABLE","PAUSED","OFFLINE","WRAP_UP"].includes(x.state)?`<button class="secondary" onclick="toggleAgent(${x.id},'${x.state}')">${x.state==="AVAILABLE"?"Pause":"Set available"}</button>`:"—"}</td></tr>`).join("");
    const queued=b.filter(x=>x.status==="QUEUED").length;el("queueCount").textContent=`${queued} queued`;
    const borrowersById=Object.fromEntries(b.map(x=>[x.id,x.name]));const agentsById=Object.fromEntries(a.map(x=>[x.id,x.name]));
    el("callsBody").innerHTML=c.slice(0,15).map(x=>`<tr><td>#${x.id}</td><td>${escapeHtml(borrowersById[x.borrower_id]||`Borrower ${x.borrower_id}`)}</td><td>${escapeHtml(agentsById[x.agent_id]||`Agent ${x.agent_id}`)}</td><td>${x.provider}</td><td>${stateBadge(x.status)}</td><td>${x.created_at}</td></tr>`).join("")||`<tr><td colspan="6">No calls yet.</td></tr>`;
  }catch(e){toast(e.message)}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function toggleAgent(id,state){try{await api(`/agents/${id}/state`,{method:"PATCH",body:JSON.stringify({state:state==="AVAILABLE"?"PAUSED":"AVAILABLE"})});refreshAll()}catch(e){toast(e.message)}}
el("agentForm").addEventListener("submit",async e=>{e.preventDefault();const name=new FormData(e.target).get("name");try{await api("/agents",{method:"POST",body:JSON.stringify({name})});e.target.reset();refreshAll();toast("Agent added")}catch(err){toast(err.message)}});
el("borrowerForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/borrowers",{method:"POST",body:JSON.stringify({name:f.get("name"),phone:f.get("phone")})});e.target.reset();refreshAll();toast("Borrower added")}catch(err){toast(err.message)}});
el("seedBtn").onclick=async()=>{try{await api("/seed",{method:"POST",body:JSON.stringify({count:10})});refreshAll();toast("Demo borrowers added")}catch(e){toast(e.message)}};
el("answerRate").oninput=e=>el("rateOut").textContent=`${e.target.value}%`;
async function runDial(mode){
  const count=Number(el("requestedCount").value);
  const body=mode==="progressive"?{count}:{answerRate:Number(el("answerRate").value)/100,avgTalkTimeSec:120,setupTimeSec:5};
  try{
    const result=await api(`/dial/${mode}`,{method:"POST",body:JSON.stringify(body)});
    el("dialResult").textContent=JSON.stringify(result,null,2);refreshAll();toast(`${mode} dial request processed`);
  }catch(e){el("dialResult").textContent=e.message;toast(e.message)}
}
el("progressiveBtn").onclick=()=>runDial("progressive");
el("predictiveBtn").onclick=()=>runDial("predictive");
refreshAll();setInterval(refreshAll,5000);
