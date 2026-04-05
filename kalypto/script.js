const SUPABASE_URL  = 'https://ahlykwcpowwzpkbpcwrn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobHlrd2Nwb3d3enBrYnBjd3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MDY5NzcsImV4cCI6MjA5MDI4Mjk3N30.XRh-JWWAOClUozW6UWJlRPbfTAt2bGeuD__HTiyVs8A';
const WORKER_URL    = 'https://broad-cell-efb3.jeremyjansenalgo.workers.dev';

const PP_CLIENT_ID    = 'AfLjbN0647utH5oc3pmyDrkMUN6H8tsAAstN6xmuiDQyeNQsqV7pS21lNWFTszw1TdkuTkdu5m756TfB';
const PP_PRO_PLAN_ID  = 'PROD-6MS01749R95856453';
const PP_SCHOLAR_PLAN_ID = 'PROD-1295331550965802L';

const PLAN_LIMITS = { free: 12000, pro: 60000, scholar: 150000 };

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let paperText='', paperName='', chatHistory=[], isLoading=false, activeChatId=null, currentUser=null;
let compareSlots={A:{name:'',text:''},B:{name:'',text:''}}, compareLoading=false, compareHistory=[];
let signOutPending=false, currentPage='chat', currentPlan='free';
let ppSdkLoaded=false, ppButtonsRendered=false;

const $ = id => document.getElementById(id);

const authModal=$('authModal'), authError=$('authError'), authSuccess=$('authSuccess');
const planModal=$('planModal');
const userBtn=$('userBtn'), userEmailEl=$('userEmail'), syncDot=$('syncDot');
const headerSignInBtn=$('headerSignInBtn');
const fileInput=$('fileInput'), dropZone=$('dropZone');
const messagesDiv=$('messages'), emptyState=$('emptyState');
const userInput=$('userInput'), sendBtn=$('sendBtn');
const statusPill=$('statusPill'), paperCard=$('paperCard');
const paperTitle=$('paperTitle'), paperMeta=$('paperMeta');
const progressWrap=$('progressWrap'), progressBar=$('progressBar');
const chatList=$('chatList'), noChats=$('noChats'), chatHeader=$('chatHeader');
const newChatBtn=$('newChatBtn'), urlInput=$('urlInput'), urlFetchBtn=$('urlFetchBtn');
const chatSidebar=$('chatSidebar'), cmpSidebar=$('cmpSidebar'), overlay=$('overlay'), menuBtn=$('menuBtn');
const chatPage=$('chatPage'), comparePage=$('comparePage');
const compareResults=$('compareResults'), compareEmpty=$('compareEmpty');
const compareInput=$('compareInput'), compareSendBtn=$('compareSendBtn');
const guestBanner=$('guestBanner');
const quickBtns={summarize:$('btnSummarize'),methods:$('btnMethods'),findings:$('btnFindings'),quiz:$('btnQuiz'),flash:$('btnFlash')};
const cmpBtns={summary:$('cmpSummary'),agree:$('cmpAgree'),conflict:$('cmpConflict'),table:$('cmpTable')};

function getPDFCharLimit(){ return PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free; }

function loadPayPalSDK(){
  return new Promise((resolve, reject) => {
    if(ppSdkLoaded){ resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${PP_CLIENT_ID}&vault=true&intent=subscription&currency=PHP`;
    s.onload = () => { ppSdkLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
}

async function renderPayPalButtons(){
  if(ppButtonsRendered) return;

  if(!currentUser){
    ['Pro','Scholar'].forEach(tier => {
      const wrap = $(`paypal${tier}Wrap`);
      wrap.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'plan-signin-prompt';
      btn.textContent = 'Sign in to subscribe';
      btn.onclick = () => { planModal.classList.remove('open'); openAuth(); };
      wrap.appendChild(btn);
    });
    return;
  }

  if(currentPlan !== 'free'){
    const activeTier = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
    const wrap = $(`paypal${activeTier}Wrap`);
    if(wrap){
      wrap.innerHTML = `<div class="plan-cta-free">✓ Current plan</div>`;
    }
  }

  try {
    await loadPayPalSDK();
  } catch(e) {
    ['Pro','Scholar'].forEach(tier => {
      $(`paypal${tier}Wrap`).innerHTML = `<div style="font-size:11px;color:var(--danger);text-align:center;padding:8px">Could not load PayPal. Check your connection.</div>`;
    });
    return;
  }

  if(currentPlan !== 'pro'){
    $('paypalProWrap').innerHTML = '';
    paypal.Buttons({
      style:{ shape:'rect', color:'gold', layout:'vertical', label:'subscribe', height:40 },
      createSubscription: (data, actions) => actions.subscription.create({
        plan_id: PP_PRO_PLAN_ID,
        custom_id: currentUser.id
      }),
      onApprove: (data) => onSubscriptionApproved(data, 'pro'),
      onError: (err) => console.error('PayPal error (Pro):', err)
    }).render('#paypalProWrap');
  }

  if(currentPlan !== 'scholar'){
    $('paypalScholarWrap').innerHTML = '';
    paypal.Buttons({
      style:{ shape:'rect', color:'silver', layout:'vertical', label:'subscribe', height:40 },
      createSubscription: (data, actions) => actions.subscription.create({
        plan_id: PP_SCHOLAR_PLAN_ID,
        custom_id: currentUser.id
      }),
      onApprove: (data) => onSubscriptionApproved(data, 'scholar'),
      onError: (err) => console.error('PayPal error (Scholar):', err)
    }).render('#paypalScholarWrap');
  }

  ppButtonsRendered = true;
}

function onSubscriptionApproved(data, plan){
  const tier = plan.charAt(0).toUpperCase() + plan.slice(1);
  const wrap = $(`paypal${tier}Wrap`);
  wrap.innerHTML = `
    <div class="plan-success">
      ✓ Subscribed! Your <strong>${tier}</strong> plan is activating.<br/>
      <span style="font-size:10px;opacity:0.8">Refresh in a few seconds to see your new limit.</span>
    </div>`;
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    await fetchUserPlan();
    if(currentPlan === plan || attempts >= 5){
      clearInterval(poll);
      if(currentPlan === plan){
        planModal.classList.remove('open');
        ppButtonsRendered = false;
      }
    }
  }, 3000);
}

$('planBtn').addEventListener('click', () => {
  ppButtonsRendered = false;
  planModal.classList.add('open');
  renderPayPalButtons();
});
$('planModalClose').addEventListener('click', () => planModal.classList.remove('open'));
planModal.addEventListener('click', e => { if(e.target === planModal) planModal.classList.remove('open'); });

function openAuth(){ authModal.classList.add('open'); authError.textContent=''; authSuccess.textContent=''; }
function closeAuth(){ authModal.classList.remove('open'); }
$('authModalClose').addEventListener('click', closeAuth);
authModal.addEventListener('click', e => { if(e.target === authModal) closeAuth(); });
headerSignInBtn.addEventListener('click', openAuth);
$('guestSignInBtn').addEventListener('click', openAuth);

$('authTabLogin').addEventListener('click', () => {
  $('authTabLogin').classList.add('active'); $('authTabRegister').classList.remove('active');
  $('authLoginForm').style.display=''; $('authRegisterForm').style.display='none';
  authError.textContent=''; authSuccess.textContent='';
});
$('authTabRegister').addEventListener('click', () => {
  $('authTabRegister').classList.add('active'); $('authTabLogin').classList.remove('active');
  $('authRegisterForm').style.display=''; $('authLoginForm').style.display='none';
  authError.textContent=''; authSuccess.textContent='';
});
$('loginBtn').addEventListener('click', async () => {
  const email=$('loginEmail').value.trim(), password=$('loginPassword').value;
  authError.textContent=''; authSuccess.textContent='';
  if(!email||!password){ authError.textContent='Please fill in both fields.'; return; }
  const btn=$('loginBtn'); btn.disabled=true; btn.textContent='Signing in…';
  try{
    const{error}=await supabase.auth.signInWithPassword({email,password});
    if(error){ authError.textContent=error.message; btn.disabled=false; btn.textContent='Sign In'; }
  }catch{ authError.textContent='Unexpected error.'; btn.disabled=false; btn.textContent='Sign In'; }
});
$('loginPassword').addEventListener('keydown', e => { if(e.key==='Enter') $('loginBtn').click(); });
$('loginEmail').addEventListener('keydown',   e => { if(e.key==='Enter') $('loginBtn').click(); });
$('registerEmail').addEventListener('keydown',    e => { if(e.key==='Enter') $('registerBtn').click(); });
$('registerPassword').addEventListener('keydown', e => { if(e.key==='Enter') $('registerBtn').click(); });
$('registerBtn').addEventListener('click', async () => {
  const email=$('registerEmail').value.trim(), password=$('registerPassword').value;
  authError.textContent=''; authSuccess.textContent='';
  if(!email||!password){ authError.textContent='Please fill in both fields.'; return; }
  if(password.length<6){ authError.textContent='Password must be at least 6 characters.'; return; }
  const btn=$('registerBtn'); btn.disabled=true; btn.textContent='Creating account…';
  try{
    const{data,error}=await supabase.auth.signUp({email,password});
    if(error){ authError.textContent=error.message; btn.disabled=false; btn.textContent='Create Account'; }
    else if(data.session){ authSuccess.textContent='✓ Account created! Logging you in…'; }
    else{ authSuccess.textContent='✓ Check your email to confirm, then sign in.'; btn.disabled=false; btn.textContent='Create Account'; }
  }catch{ authError.textContent='Unexpected error.'; btn.disabled=false; btn.textContent='Create Account'; }
});
$('googleBtn').addEventListener('click', async () => {
  authError.textContent='';
  try{ const{error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href}}); if(error) authError.textContent=error.message; }
  catch{ authError.textContent='Could not open Google sign-in.'; }
});

userBtn.addEventListener('click', async () => {
  if(!signOutPending){
    signOutPending=true;
    userBtn.style.color='var(--danger)'; userBtn.style.borderColor='var(--danger)';
    userEmailEl.textContent='Click again to sign out';
    setTimeout(()=>{
      if(signOutPending){
        signOutPending=false;
        const email=currentUser?.email||'Logged in';
        userEmailEl.textContent=email.length>20?email.slice(0,18)+'…':email;
        userBtn.style.color=''; userBtn.style.borderColor='';
      }
    },3000);
  }else{
    signOutPending=false;
    await saveCurrentChat();
    await supabase.auth.signOut();
  }
});

async function fetchUserPlan(){
  if(!currentUser) return;
  try{
    const{data}=await supabase.from('user_plans').select('plan').eq('user_id',currentUser.id).single();
    currentPlan = data?.plan || 'free';
  }catch{ currentPlan='free'; }
}

async function migrateGuestChats(){
  const guests=getGuestChats();
  if(!guests.length){ localStorage.removeItem('kalypto_guest_chats'); return; }
  const{data:cloudChats}=await supabase.from('chats').select('id,updated_at').eq('user_id',currentUser.id);
  const cloudMap={};
  if(cloudChats) cloudChats.forEach(c=>{ cloudMap[c.id]=c.updated_at; });
  for(const chat of guests){
    if(cloudMap[chat.id]&&chat.updated_at&&new Date(cloudMap[chat.id])>new Date(chat.updated_at)) continue;
    await supabase.from('chats').upsert({...chat,user_id:currentUser.id});
  }
  localStorage.removeItem('kalypto_guest_chats');
}

supabase.auth.onAuthStateChange(async(event,session)=>{
  if(session?.user){
    currentUser=session.user;
    closeAuth();
    const email=session.user.email||'Logged in';
    userEmailEl.textContent=email.length>20?email.slice(0,18)+'…':email;
    userBtn.style.display='flex';
    headerSignInBtn.style.display='none';
    guestBanner.style.display='none';
    await fetchUserPlan();
    await migrateGuestChats();
    try{ await loadChats(); }catch(err){ console.error(err); activeChatId='chat_'+Date.now(); }
    const lb=$('loginBtn'); lb.disabled=false; lb.textContent='Sign In';
  }else{
    currentUser=null; currentPlan='free'; signOutPending=false;
    activeChatId='chat_'+Date.now();
    localStorage.setItem('kalypto_active_chat',activeChatId);
    userBtn.style.display='none'; userBtn.style.color=''; userBtn.style.borderColor='';
    headerSignInBtn.style.display='';
    guestBanner.style.display='flex';
    paperText=''; paperName=''; chatHistory=[];
    clearMessagesUI();
    paperCard.classList.remove('visible');
    statusPill.textContent='No paper loaded'; statusPill.classList.remove('has-paper');
    sendBtn.disabled=true;
    Object.values(quickBtns).forEach(b=>b.disabled=true);
    chatHeader.innerHTML='No paper loaded';
    const lb=$('loginBtn'); lb.disabled=false; lb.textContent='Sign In';
    await loadChats();
  }
});

function showSync(){ syncDot.classList.add('syncing'); }
function hideSync(){ syncDot.classList.remove('syncing'); }

function getGuestChats(){ try{ return JSON.parse(localStorage.getItem('kalypto_guest_chats')||'[]'); }catch{ return []; } }
function saveGuestChats(chats){ localStorage.setItem('kalypto_guest_chats',JSON.stringify(chats)); }
function saveGuestChat(row){
  const chats=getGuestChats();
  const idx=chats.findIndex(c=>c.id===row.id);
  if(idx>=0) chats[idx]=row; else chats.unshift(row);
  saveGuestChats(chats.slice(0,50));
}
function deleteGuestChat(id){ saveGuestChats(getGuestChats().filter(c=>c.id!==id)); }

async function getChats(){
  if(currentUser){
    const{data}=await supabase.from('chats').select('*').eq('user_id',currentUser.id).order('updated_at',{ascending:false});
    return data||[];
  }
  return getGuestChats();
}
async function persistChat(row){
  if(currentUser){ showSync(); const{error}=await supabase.from('chats').upsert({...row,user_id:currentUser.id}); hideSync(); if(error) console.error(error); }
  else saveGuestChat(row);
}
async function removeChat(id){
  if(currentUser){ showSync(); await supabase.from('chats').delete().eq('id',id).eq('user_id',currentUser.id); hideSync(); }
  else deleteGuestChat(id);
}

async function loadChats(){
  showSync();
  const chats=await getChats();
  hideSync();
  renderChatList(chats);
  const lastId=localStorage.getItem('kalypto_active_chat');
  if(lastId&&chats.find(c=>c.id===lastId)){ activeChatId=lastId; restoreChat(chats.find(c=>c.id===lastId)); }
  else if(chats.length){ activeChatId=chats[0].id; restoreChat(chats[0]); }
  else{ activeChatId='chat_'+Date.now(); localStorage.setItem('kalypto_active_chat',activeChatId); }
}

async function saveCurrentChat(){
  if(!activeChatId) return;
  if(!paperName&&chatHistory.length===0) return;
  const row={
    id:activeChatId, paper_name:paperName, paper_text:paperText, history:chatHistory,
    preview:chatHistory.find(m=>m.role==='user')?.content?.slice(0,60)||'No messages yet',
    updated_at:new Date().toISOString()
  };
  await persistChat(row);
  renderChatList(await getChats());
}

function restoreChat(chat){
  paperText=chat.paper_text||''; paperName=chat.paper_name||'';
  chatHistory=chat.history||[]; activeChatId=chat.id;
  localStorage.setItem('kalypto_active_chat',chat.id); clearMessagesUI();
  if(paperName){
    paperTitle.textContent=paperName; paperMeta.textContent='Restored from saved chat';
    paperCard.classList.add('visible'); statusPill.textContent='● Paper loaded'; statusPill.classList.add('has-paper');
    sendBtn.disabled=false; Object.values(quickBtns).forEach(b=>b.disabled=false);
    chatHeader.innerHTML=`Paper: <span>${paperName}</span>`;
  }
  if(chatHistory.length){
    emptyState.style.display='none';
    chatHistory.forEach(msg=>renderMessage(msg.role,msg.content,false));
    messagesDiv.scrollTop=messagesDiv.scrollHeight;
  }
}

async function createNewChat(){
  await saveCurrentChat();
  activeChatId='chat_'+Date.now(); localStorage.setItem('kalypto_active_chat',activeChatId);
  paperText=''; paperName=''; chatHistory=[]; clearMessagesUI();
  paperCard.classList.remove('visible');
  statusPill.textContent='No paper loaded'; statusPill.classList.remove('has-paper');
  sendBtn.disabled=true; Object.values(quickBtns).forEach(b=>b.disabled=true);
  chatHeader.innerHTML='No paper loaded';
  renderChatList(await getChats()); closeSidebarOnMobile();
}

async function switchToChat(chatId){
  if(chatId===activeChatId) return;
  await saveCurrentChat();
  const chats=await getChats();
  const chat=chats.find(c=>c.id===chatId);
  if(chat) restoreChat(chat);
  renderChatList(chats); closeSidebarOnMobile();
}

async function deleteChat(chatId,e){
  e.stopPropagation();
  await removeChat(chatId);
  if(chatId===activeChatId) await createNewChat();
  renderChatList(await getChats());
}

function renderChatList(chats){
  const existing=Array.from(chatList.querySelectorAll('.chat-entry'));
  if(existing.length===(chats||[]).length){
    const unchanged=existing.every((el,i)=>{
      const c=chats[i]; return el.dataset.id===c.id&&el.dataset.updatedAt===c.updated_at;
    });
    if(unchanged){ existing.forEach(el=>{ const isActive=el.dataset.id===activeChatId; if(isActive&&!el.classList.contains('active'))el.classList.add('active'); if(!isActive&&el.classList.contains('active'))el.classList.remove('active'); }); return; }
  }
  existing.forEach(e=>e.remove());
  if(!chats||!chats.length){ noChats.style.display='block'; return; }
  noChats.style.display='none';
  chats.forEach(chat=>{
    const entry=document.createElement('div');
    entry.className='chat-entry'+(chat.id===activeChatId?' active':'');
    entry.dataset.id=chat.id; entry.dataset.updatedAt=chat.updated_at||'';
    const date=chat.updated_at?new Date(chat.updated_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'}):'';
    entry.innerHTML=`<div class="chat-entry-info"><div class="chat-entry-paper">${chat.paper_name||'No paper'}</div><div class="chat-entry-preview">${chat.preview||'Empty chat'}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><div class="chat-entry-date">${date}</div><button class="chat-delete-btn" title="Delete">✕</button></div>`;
    entry.addEventListener('click',()=>switchToChat(chat.id));
    entry.querySelector('.chat-delete-btn').addEventListener('click',e=>deleteChat(chat.id,e));
    chatList.appendChild(entry);
  });
}

function clearMessagesUI(){
  Array.from(messagesDiv.children).forEach(c=>{ if(c.id!=='emptyState') c.remove(); });
  emptyState.style.display='';
}

function navigate(page){
  if(page===currentPage) return;
  currentPage=page; localStorage.setItem('kalypto_page',page);
  if(page==='compare'){
    chatPage.classList.add('hidden-left'); comparePage.classList.remove('hidden-right','hidden-left');
    $('navChat').classList.remove('active'); $('navCompare').classList.add('active');
    statusPill.style.display='none';
    if(window.location.hash!=='#compare') history.pushState(null,'','#compare');
    populatePickLists();
  }else{
    comparePage.classList.add('hidden-right'); chatPage.classList.remove('hidden-left','hidden-right');
    $('navCompare').classList.remove('active'); $('navChat').classList.add('active');
    statusPill.style.display='';
    if(window.location.hash) history.pushState(null,'',window.location.pathname);
  }
}
window.addEventListener('hashchange',()=>{ navigate(window.location.hash==='#compare'?'compare':'chat'); });
window.addEventListener('popstate',()=>{ navigate(window.location.hash==='#compare'?'compare':'chat'); });

async function populatePickLists(){
  const chats=await getChats();
  ['A','B'].forEach(slot=>{
    const list=$(`slotPickList${slot}`); list.innerHTML='';
    const valid=chats.filter(c=>c.paper_text);
    if(!valid.length){ list.innerHTML='<div class="slot-pick-item" style="color:var(--muted2)">No saved chats yet</div>'; return; }
    valid.forEach(chat=>{
      const item=document.createElement('div'); item.className='slot-pick-item';
      item.innerHTML=`<div>${chat.paper_name||'Unnamed'}</div><div class="slot-pick-item-sub">${chat.preview||''}</div>`;
      item.addEventListener('click',()=>{ compareSlots[slot]={name:chat.paper_name,text:chat.paper_text}; compareHistory=[]; showSlotCard(slot,chat.paper_name,'From saved chat'); list.classList.remove('open'); });
      list.appendChild(item);
    });
  });
}

function showSlotCard(slot,name,meta){
  $(`slotCard${slot}`).classList.add('visible'); $(`slotUpload${slot}`).style.display='none';
  $(`slotName${slot}`).textContent=name; $(`slotMeta${slot}`).textContent=meta;
  compareResults.querySelectorAll('.message').forEach(el=>el.remove());
  compareEmpty.style.display=''; compareHistory=[];
  updateCompareButtons(); updateCompareHeader();
}

function clearSlot(slot){
  compareSlots[slot]={name:'',text:''}; compareHistory=[];
  $(`slotCard${slot}`).classList.remove('visible'); $(`slotUpload${slot}`).style.display='';
  compareResults.querySelectorAll('.message').forEach(el=>el.remove());
  compareEmpty.style.display=''; updateCompareButtons(); updateCompareHeader();
}

function updateCompareButtons(){
  const both=compareSlots.A.text&&compareSlots.B.text;
  Object.values(cmpBtns).forEach(b=>b.disabled=!both); compareSendBtn.disabled=!both;
}

function updateCompareHeader(){
  $('cmpPillA').textContent=compareSlots.A.name?`A — ${compareSlots.A.name.slice(0,28)}…`:'A — none loaded';
  $('cmpPillA').className='compare-header-pill'+(compareSlots.A.name?' loaded':'');
  $('cmpPillB').textContent=compareSlots.B.name?`B — ${compareSlots.B.name.slice(0,28)}…`:'B — none loaded';
  $('cmpPillB').className='compare-header-pill'+(compareSlots.B.name?' loaded':'');
}

document.addEventListener('click',e=>{
  ['A','B'].forEach(slot=>{
    const list=$(`slotPickList${slot}`), btn=$(`slotPickBtn${slot}`);
    if(!btn.contains(e.target)&&!list.contains(e.target)) list.classList.remove('open');
  });
});

async function loadSlotPDF(slot,file){
  const pEl=$(`slotProgress${slot}`), bEl=$(`slotProgressBar${slot}`);
  pEl.classList.add('visible'); bEl.style.width='10%';
  try{
    const buf=await file.arrayBuffer(); bEl.style.width='40%';
    const pdf=await pdfjsLib.getDocument({data:buf}).promise; let txt='';
    for(let i=1;i<=pdf.numPages;i++){
      const pg=await pdf.getPage(i); const ct=await pg.getTextContent();
      txt+=ct.items.map(x=>x.str).join(' ')+'\n\n';
      bEl.style.width=(40+(i/pdf.numPages)*55)+'%';
    }
    const limit=getPDFCharLimit(); const wasTruncated=txt.length>limit;
    compareSlots[slot]={name:file.name,text:txt.slice(0,limit)};
    compareHistory=[];
    bEl.style.width='100%'; setTimeout(()=>{ pEl.classList.remove('visible'); bEl.style.width='0%'; },500);
    showSlotCard(slot,file.name,`${pdf.numPages} pages${wasTruncated?' · truncated':''}`);
  }catch(err){ pEl.classList.remove('visible'); addCompareMsg('ai',`⚠️ Error reading PDF: ${err.message}`); }
}

$('slotFileA').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) loadSlotPDF('A',f); e.target.value=''; });
$('slotFileB').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) loadSlotPDF('B',f); e.target.value=''; });
['A','B'].forEach(slot=>{
  const drop=$(`slotDrop${slot}`);
  drop.addEventListener('dragover',e=>{ e.preventDefault(); drop.style.borderColor='var(--accent-hi)'; });
  drop.addEventListener('dragleave',()=>{ drop.style.borderColor=''; });
  drop.addEventListener('drop',e=>{ e.preventDefault(); drop.style.borderColor=''; const f=e.dataTransfer.files[0]; if(f) loadSlotPDF(slot,f); });
});
$('slotClearA').addEventListener('click',()=>clearSlot('A'));
$('slotClearB').addEventListener('click',()=>clearSlot('B'));
$('slotPickBtnA').addEventListener('click',async()=>{ await populatePickLists(); setTimeout(()=>{ $('slotPickListA').classList.toggle('open'); },0); });
$('slotPickBtnB').addEventListener('click',async()=>{ await populatePickLists(); setTimeout(()=>{ $('slotPickListB').classList.toggle('open'); },0); });

function buildComparePrompt(){
  return `You are Kalypto, an AI research assistant specializing in comparing academic papers.\nAlways refer to them as "Paper A" and "Paper B". Be clear, structured, and educational.\nUse markdown tables when generating comparisons.\n\nPAPER A — ${compareSlots.A.name}:\n${compareSlots.A.text}\n\nPAPER B — ${compareSlots.B.name}:\n${compareSlots.B.text}`;
}

async function sendCompareMessage(promptText,showUser=true){
  if(!compareSlots.A.text||!compareSlots.B.text){ addCompareMsg('ai','⚠️ Please load both papers first.'); return; }
  if(compareLoading) return;
  if(showUser){ addCompareMsg('user',promptText); compareInput.value=''; compareInput.style.height='auto'; }
  compareLoading=true; compareSendBtn.disabled=true; Object.values(cmpBtns).forEach(b=>b.disabled=true);
  const lm=addCompareLoading(); compareHistory.push({role:'user',content:promptText});
  try{
    const res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:2048,messages:[{role:'system',content:buildComparePrompt()},...compareHistory]})});
    if(res.status===429){ lm.remove(); compareHistory.pop(); addCompareMsg('ai','⚠️ Rate limit reached. Please wait a moment and try again.'); compareLoading=false; compareSendBtn.disabled=false; updateCompareButtons(); return; }
    const data=await res.json(); lm.remove();
    if(data.error){ addCompareMsg('ai',`⚠️ ${data.error.message}`); compareHistory.pop(); }
    else{ const reply=data.choices?.[0]?.message?.content||'No response.'; addCompareMsg('ai',reply); compareHistory.push({role:'assistant',content:reply}); }
  }catch(err){ lm.remove(); addCompareMsg('ai',`⚠️ ${err.message}`); compareHistory.pop(); }
  compareLoading=false; compareSendBtn.disabled=false; updateCompareButtons();
}

cmpBtns.summary.addEventListener('click',()=>sendCompareMessage('Give me a side-by-side summary of Paper A and Paper B covering: (1) problem addressed, (2) approach/methodology, (3) main findings.',false));
cmpBtns.agree.addEventListener('click',()=>sendCompareMessage('What do Paper A and Paper B agree on? List and explain key points of agreement.',false));
cmpBtns.conflict.addEventListener('click',()=>sendCompareMessage('What are the contradictions or disagreements between Paper A and Paper B? List and explain.',false));
cmpBtns.table.addEventListener('click',()=>sendCompareMessage('Generate a markdown comparison table for Paper A and Paper B. Columns: Research Question, Methodology, Sample/Data, Key Findings, Limitations, Conclusions.',false));
compareSendBtn.addEventListener('click',()=>{ const t=compareInput.value.trim(); if(t) sendCompareMessage(t); });
compareInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); const t=compareInput.value.trim(); if(t) sendCompareMessage(t); } });
compareInput.addEventListener('input',()=>{ compareInput.style.height='auto'; compareInput.style.height=Math.min(compareInput.scrollHeight,150)+'px'; });

function addCompareMsg(role,text){
  compareEmpty.style.display='none';
  const d=document.createElement('div'); d.className=`message ${role==='user'?'user':'ai'}`; d.style.maxWidth='100%';
  if(role==='user') d.textContent=text;
  else d.innerHTML=`<span class="sender">Kalypto</span>${formatText(text)}`;
  compareResults.appendChild(d); compareResults.scrollTop=compareResults.scrollHeight; return d;
}
function addCompareLoading(){
  compareEmpty.style.display='none';
  const d=document.createElement('div'); d.className='message ai loading'; d.style.maxWidth='100%';
  d.innerHTML=`<span class="sender">Kalypto</span><span class="dots"><span>•</span><span>•</span><span>•</span></span>`;
  compareResults.appendChild(d); compareResults.scrollTop=compareResults.scrollHeight; return d;
}

function openSidebar(){ const sb=currentPage==='compare'?cmpSidebar:chatSidebar; sb.classList.add('open'); overlay.classList.add('visible'); document.body.style.overflow='hidden'; }
function closeSidebar(){ chatSidebar.classList.remove('open'); cmpSidebar.classList.remove('open'); overlay.classList.remove('visible'); document.body.style.overflow=''; }
function closeSidebarOnMobile(){ if(window.innerWidth<=768) closeSidebar(); }
menuBtn.addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

$('tabUpload').addEventListener('click',()=>{ $('tabUpload').classList.add('active'); $('tabUrl').classList.remove('active'); $('panelUpload').classList.add('active'); $('panelUrl').classList.remove('active'); });
$('tabUrl').addEventListener('click',()=>{ $('tabUrl').classList.add('active'); $('tabUpload').classList.remove('active'); $('panelUrl').classList.add('active'); $('panelUpload').classList.remove('active'); });

function normalizeArxivUrl(url){
  const m=url.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)/i);
  return m?`https://arxiv.org/pdf/${m[1]}`:null;
}

async function loadFromUrl(){
  if(urlFetchBtn.disabled) return;
  const raw=urlInput.value.trim(); if(!raw) return;
  urlFetchBtn.disabled=true; urlFetchBtn.textContent='…';
  let pdfUrl=normalizeArxivUrl(raw);
  if(!pdfUrl&&raw.toLowerCase().endsWith('.pdf')){ pdfUrl=raw.startsWith('http')?raw:'https://'+raw; }
  if(!pdfUrl){ addMessage('ai','⚠️ Unsupported link. Kalypto supports ArXiv links and direct .pdf URLs.'); urlFetchBtn.disabled=false; urlFetchBtn.textContent='Load'; return; }
  try{
    progressWrap.classList.add('visible'); progressBar.style.width='20%';
    const res=await fetch(WORKER_URL+'/fetch-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:pdfUrl})});
    if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Could not fetch PDF (${res.status}).`); }
    progressBar.style.width='50%'; const buf=await res.arrayBuffer();
    const parts=pdfUrl.split('/'); const fn=parts[parts.length-1]+(pdfUrl.endsWith('.pdf')?'':'.pdf');
    await parsePDFBuffer(buf,fn);
  }catch(err){ progressWrap.classList.remove('visible'); progressBar.style.width='0%'; addMessage('ai',`⚠️ Error: ${err.message}`); }
  urlFetchBtn.disabled=false; urlFetchBtn.textContent='Load';
}
urlFetchBtn.addEventListener('click', loadFromUrl);
urlInput.addEventListener('keydown', e=>{ if(e.key==='Enter') loadFromUrl(); });

async function parsePDFBuffer(arrayBuffer,displayName){
  if(chatHistory.length){
    await saveCurrentChat();
    activeChatId='chat_'+Date.now(); localStorage.setItem('kalypto_active_chat',activeChatId);
    chatHistory=[]; clearMessagesUI();
  }
  paperName=displayName; progressBar.style.width='60%';
  try{
    const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise; let fullText='';
    for(let i=1;i<=pdf.numPages;i++){
      const pg=await pdf.getPage(i); const ct=await pg.getTextContent();
      fullText+=ct.items.map(x=>x.str).join(' ')+'\n\n';
      progressBar.style.width=(60+(i/pdf.numPages)*35)+'%';
    }
    const limit=getPDFCharLimit(); const wasTruncated=fullText.length>limit;
    paperText=fullText.slice(0,limit);
    progressBar.style.width='100%';
    setTimeout(()=>{ progressWrap.classList.remove('visible'); progressBar.style.width='0%'; },600);
    paperTitle.textContent=paperName;
    paperMeta.textContent=`${pdf.numPages} pages · ${Math.round(fullText.length/1000)}k chars${wasTruncated?' · truncated':''}`;
    paperCard.classList.add('visible'); statusPill.textContent='● Paper loaded'; statusPill.classList.add('has-paper');
    chatHeader.innerHTML=`Paper: <span>${paperName}</span>`;
    sendBtn.disabled=false; Object.values(quickBtns).forEach(b=>b.disabled=false);
    let welcome=`**Paper loaded:** ${paperName}\n\nI've read through the document. Ask me anything about it, or use the quick actions on the left.`;
    if(wasTruncated){
      const planName=currentPlan.charAt(0).toUpperCase()+currentPlan.slice(1);
      welcome+=`\n\n⚠️ This document is large — only the first ~${Math.round(limit/1000)}k characters were loaded on your **${planName}** plan. <a href="#" onclick="document.getElementById('planBtn').click();return false;" style="color:var(--accent-hi)">Upgrade your plan</a> to load more.`;
    }
    chatHistory.push({role:'assistant',content:welcome}); addMessage('ai',welcome);
    await saveCurrentChat(); closeSidebarOnMobile();
  }catch(err){ progressWrap.classList.remove('visible'); addMessage('ai',`⚠️ Error reading PDF: ${err.message}`); }
}

async function loadPDF(file){
  progressWrap.classList.add('visible'); progressBar.style.width='10%';
  const buf=await file.arrayBuffer(); progressBar.style.width='30%';
  await parsePDFBuffer(buf,file.name);
}
fileInput.addEventListener('change',e=>{ const f=e.target.files[0]; if(f&&f.type==='application/pdf') loadPDF(f); e.target.value=''; });
dropZone.addEventListener('dragover',e=>{ e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{ e.preventDefault(); dropZone.classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f&&f.type==='application/pdf') loadPDF(f); });

async function sendMessage(override){
  const text=(override||userInput.value).trim(); if(!text||isLoading) return;
  isLoading=true; sendBtn.disabled=true; Object.values(quickBtns).forEach(b=>b.disabled=true);
  addMessage('user',text);
  if(!override){ userInput.value=''; userInput.style.height='auto'; }
  const lm=addLoadingMessage();
  chatHistory.push({role:'user',content:text});
  try{
    const res=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:1024,messages:[{role:'system',content:`You are Kalypto, an AI research & study assistant. Help users understand academic papers. Be clear and educational. Use markdown formatting.\n\nPAPER CONTENT:\n${paperText}`},...chatHistory.map(m=>({role:m.role==='user'?'user':'assistant',content:m.content}))]})});
    if(res.status===429){ lm.remove(); chatHistory.pop(); addMessage('ai','⚠️ Rate limit reached. Please wait a moment and try again.'); isLoading=false; sendBtn.disabled=false; Object.values(quickBtns).forEach(b=>b.disabled=!paperText); return; }
    const data=await res.json(); lm.remove();
    if(data.error){ addMessage('ai',`⚠️ ${data.error.message}`); chatHistory.pop(); }
    else{ const reply=data.choices?.[0]?.message?.content||'No response.'; addMessage('ai',reply); chatHistory.push({role:'assistant',content:reply}); await saveCurrentChat(); }
  }catch(err){ lm.remove(); addMessage('ai',`⚠️ Network error: ${err.message}`); chatHistory.pop(); }
  isLoading=false; sendBtn.disabled=false; Object.values(quickBtns).forEach(b=>b.disabled=!paperText);
}

function renderMessage(role,text,animate=true){
  if(emptyState) emptyState.style.display='none';
  const div=document.createElement('div'); div.className=`message ${role==='user'?'user':'ai'}`;
  if(!animate) div.style.animation='none';
  if(role!=='user'){
    div.innerHTML=`<span class="sender">Kalypto</span>${formatText(text)}<div class="message-actions"><button class="copy-btn" data-copy="plain">📋 Copy text</button><button class="copy-btn" data-copy="markdown">{ } Copy markdown</button></div>`;
    div.dataset.raw=text;
    div.querySelectorAll('.copy-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const raw=div.dataset.raw;
        const content=btn.dataset.copy==='plain'?raw.replace(/\*\*(.*?)\*\*/g,'$1').replace(/`(.*?)`/g,'$1').replace(/^- /gm,'• '):raw;
        navigator.clipboard.writeText(content).then(()=>{ const o=btn.textContent; btn.textContent='✓ Copied!'; btn.classList.add('copied'); setTimeout(()=>{ btn.textContent=o; btn.classList.remove('copied'); },1500); });
      });
    });
  }else{ div.textContent=text; }
  messagesDiv.appendChild(div); messagesDiv.scrollTop=messagesDiv.scrollHeight; return div;
}
function addMessage(role,text){ return renderMessage(role,text,true); }
function addLoadingMessage(){
  if(emptyState) emptyState.style.display='none';
  const div=document.createElement('div'); div.className='message ai loading';
  div.innerHTML=`<span class="sender">Kalypto</span><span class="dots"><span>•</span><span>•</span><span>•</span></span>`;
  messagesDiv.appendChild(div); messagesDiv.scrollTop=messagesDiv.scrollHeight; return div;
}

function formatText(text){
  const FENCE='```';
  const segments=text.split(FENCE);
  const processedSegments=segments.map((seg,i)=>{
    if(i%2!==0) return FENCE+seg+FENCE;
    let h=seg.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`(.*?)`/g,'<code>$1</code>');
    h=h.replace(/((\|.+\|\n?)+)/g,m=>{
      const rows=m.trim().split('\n').filter(r=>!/^[\s|:-]+$/.test(r));
      if(rows.length<2) return m;
      return '<div style="overflow-x:auto;margin:6px 0"><table style="border-collapse:collapse;width:100%;font-size:12px">'+
        rows.map((row,i)=>'<tr>'+row.split('|').filter((_,j,a)=>j>0&&j<a.length-1).map(cell=>
          i===0?`<th style="border:1px solid var(--border);padding:6px 10px;background:rgba(99,102,241,0.1);text-align:left;color:var(--accent-hi);font-weight:600">${cell.trim()}</th>`
               :`<td style="border:1px solid var(--border);padding:6px 10px">${cell.trim()}</td>`
        ).join('')+'</tr>').join('')+'</table></div>';
    });
    h=h.replace(/^- (.+)$/gm,'<li>$1</li>');
    return h.split('\n\n').map(block=>{
      block=block.replace(/<\/li>\n?<li>/g,'</li><li>').replace(/\n/g,'<br>');
      const t=block.trim();
      if(t.startsWith('<li>')) return `<ul>${block}</ul>`;
      if(/^<(ul|div|table)/.test(t)) return block;
      return `<p>${block}</p>`;
    }).join('');
  });
  return processedSegments.join('');
}

newChatBtn.addEventListener('click', createNewChat);
quickBtns.summarize.addEventListener('click',()=>{ sendMessage('Please give me a clear, structured summary of this paper. Include: what problem it addresses, the approach used, and the main findings.'); userInput.value=''; userInput.style.height='auto'; closeSidebarOnMobile(); });
quickBtns.methods.addEventListener('click',()=>{ sendMessage('Explain the research methodology of this paper in simple terms. What did the researchers actually do?'); userInput.value=''; userInput.style.height='auto'; closeSidebarOnMobile(); });
quickBtns.findings.addEventListener('click',()=>{ sendMessage('What are the key findings and conclusions of this paper? What do the results mean?'); userInput.value=''; userInput.style.height='auto'; closeSidebarOnMobile(); });
quickBtns.quiz.addEventListener('click',()=>{ sendMessage('Generate 5 study questions based on this paper, ranging from basic recall to deeper conceptual understanding. Include the answers.'); userInput.value=''; userInput.style.height='auto'; closeSidebarOnMobile(); });
quickBtns.flash.addEventListener('click',()=>{ sendMessage('Create 8 flashcard-style bullet points from this paper. Format each as: TERM: definition or concept.'); userInput.value=''; userInput.style.height='auto'; closeSidebarOnMobile(); });
userInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input',()=>{ userInput.style.height='auto'; userInput.style.height=Math.min(userInput.scrollHeight,150)+'px'; });
sendBtn.addEventListener('click',()=>sendMessage());

const themeToggle=$('themeToggle');
function applyTheme(t){ if(t==='light'){ document.body.classList.add('light'); themeToggle.textContent='🌙 Dark'; }else{ document.body.classList.remove('light'); themeToggle.textContent='☀ Light'; } }
applyTheme(localStorage.getItem('kalypto_theme')||'dark');
themeToggle.addEventListener('click',()=>{ const n=document.body.classList.contains('light')?'dark':'light'; localStorage.setItem('kalypto_theme',n); applyTheme(n); });

(async()=>{
  const{data:{session}}=await supabase.auth.getSession();
  if(!session){ guestBanner.style.display='flex'; headerSignInBtn.style.display=''; await loadChats(); }
  if(window.location.hash==='#compare') navigate('compare');
})();
