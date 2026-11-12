const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  chart:'<path d="M4 3v17h17M9 15v-5m5 5V5m5 10v-7"/>',
  book:'<path d="M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3V4Z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  circle:'<circle cx="12" cy="12" r="8"/>',checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>',arrowLeft:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  warning:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v.1"/>',
  flag:'<path d="M5 21V3h14l-3 5 3 5H5"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  file:'<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit:'<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  minus:'<path d="M5 12h14"/>',plus:'<path d="M5 12h14M12 5v14"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.circle}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const state = {runs:[],run:null,bundle:null,document:null,caseId:null,flagIndex:0,page:0,tab:'ai',view:'text',zoom:100,filter:'all',query:'',onlyErrors:false,dirty:false,saving:false,saveError:'',generation:0,savePromise:null,switching:false};
let saveTimer,toastTimer;
let reviewer;
try { reviewer=localStorage.getItem('benchmark-reviewer')||'Người duyệt 1'; } catch { reviewer='Người duyệt 1'; }
$('#reviewer-name').value=reviewer;
const types={risky:'Có rủi ro',missing:'Thiếu điều khoản',unclear:'Mơ hồ'};
const severity={high:'Cao',medium:'Trung bình',low:'Thấp'};
const pct=n=>typeof n==='number'?`${(n*100).toFixed(1).replace('.',',')}%`:'—';
const date=s=>new Date(s).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const current=()=>state.bundle?.cases.find(c=>c.id===state.caseId);
const blankFlag=()=>({semantic_correctness:null,explanation_faithfulness:null,actionable_question:null,plain_vietnamese:null,visual_highlight_correct:null,notes:''});
const blankCase=()=>({status:'draft',flags:{},label_decision:'pending',label_notes:'',omitted_issue_notes:''});
const caseReview=id=>state.document?.cases[id]??blankCase();
const flagReview=id=>caseReview(state.caseId).flags[id]??blankFlag();
const currentFlag=()=>current()?.result?.flags[state.flagIndex];
function notice(message,error=false){clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,5000);}
async function request(route,options={}) {
  const response=await fetch(route,{...options,headers:{'Content-Type':'application/json','x-benchmark-review':'1',...options.headers},signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||`Lỗi ${response.status}`);
  return body;
}
function setSaveStatus(){
  const el=$('#save-status');el.classList.toggle('error',!!state.saveError);
  el.innerHTML=state.saveError?`${icon('warning')} Chưa lưu được · Xuất phiếu để giữ bản nháp`:state.saving?`${icon('circle')} Đang lưu…`:state.dirty?`${icon('edit')} Có thay đổi chưa lưu`:`${icon('check')} ${state.document?.updated_at?'Đã lưu trên máy':'Sẵn sàng duyệt'}`;
}
function markDirty(){state.dirty=true;state.saveError='';state.generation++;clearTimeout(saveTimer);saveTimer=setTimeout(()=>void save().catch(()=>{}),700);setSaveStatus();renderStats();renderList();renderFooter();}
function editCase(patch){const c=caseReview(state.caseId);state.document.cases[state.caseId]={...c,...patch,status:'draft'};markDirty();}
function editFlag(patch){const flag=currentFlag();if(!flag)return;const c=caseReview(state.caseId);editCase({flags:{...c.flags,[flag.id]:{...flagReview(flag.id),...patch}}});}
async function save(){
  clearTimeout(saveTimer);
  if(state.savePromise)return state.savePromise;
  if(!state.dirty||!state.document)return;
  state.savePromise=(async()=>{
    state.saving=true;setSaveStatus();
    try {
      while(state.dirty) {
        const generation=state.generation;
        const body={reviewer:state.document.reviewer,revision:state.document.revision,cases:structuredClone(state.document.cases)};
        const saved=await request(`/api/runs/${state.run}/reviews`,{method:'PUT',body:JSON.stringify(body)});
        state.document.revision=saved.revision;state.document.updated_at=saved.updated_at;
        state.dirty=state.generation!==generation;
      }
      state.saveError='';
    }catch(error){state.saveError=error.message;notice(error.message,true);throw error;}
    finally{state.saving=false;setSaveStatus();}
  })();
  try{return await state.savePromise;}finally{state.savePromise=null;}
}
async function openRun(id,name=reviewer){
  if(state.switching)return;state.switching=true;$('#run-select').disabled=true;$('#reviewer-name').disabled=true;$('#workspace').inert=true;
  try {
    await save();
    const [bundle,document]=await Promise.all([request(`/api/runs/${id}`),request(`/api/runs/${id}/reviews?reviewer=${encodeURIComponent(name)}`)]);
    state.run=id;state.bundle=bundle;state.document=document;reviewer=name;
    try{localStorage.setItem('benchmark-reviewer',reviewer);}catch{}
    $('#reviewer-name').value=reviewer;$('#avatar').textContent=reviewer[0]?.toUpperCase()??'N';$('#run-select').value=id;
    const desired=new URL(location.href).searchParams.get('case');
    state.caseId=bundle.cases.some(c=>c.id===desired)?desired:bundle.cases[0]?.id;
    state.flagIndex=0;state.page=0;state.dirty=false;state.saveError='';state.query='';state.filter='all';state.onlyErrors=false;
    $('#search').value='';$('#only-errors').checked=false;updateURL();render();
  }catch(error){notice(error.message,true);$('#reviewer-name').value=reviewer;if(state.run)$('#run-select').value=state.run;}
  finally{state.switching=false;$('#run-select').disabled=false;$('#reviewer-name').disabled=false;$('#workspace').inert=false;}
}
function updateURL(){if(state.run&&state.caseId)history.replaceState(null,'',`/?run=${encodeURIComponent(state.run)}&case=${encodeURIComponent(state.caseId)}`);}
function visibleCases(){return(state.bundle?.cases??[]).filter(c=>{
  const review=caseReview(c.id),done=review.status==='done';
  const text=[c.id,c.title,...c.tags,...(c.result?.flags??[]).map(f=>f.rule_id)].join(' ').toLowerCase();
  return text.includes(state.query.toLowerCase())&&(state.filter==='all'||(state.filter==='done'?done:!done))&&(!state.onlyErrors||c.error||c.score?.fp||c.score?.fn);
});}
function chooseCase(id){state.caseId=id;state.flagIndex=0;state.page=0;state.zoom=100;updateURL();renderList();renderDocument();renderReview();}
function nextCase(direction=1){const items=visibleCases(),index=items.findIndex(c=>c.id===state.caseId);const next=items[index+direction];if(next)chooseCase(next.id);else notice(direction>0?'Đã đến ca cuối trong danh sách.':'Đang ở ca đầu trong danh sách.');}
function render(){renderStats();renderList();renderDocument();renderReview();setSaveStatus();const run=state.runs.find(r=>r.id===state.run);$('#run-caption').textContent=`${run?.model??'—'} · ${state.bundle?.report.dataset_version??'—'}`;}
function renderStats(){
  if(!state.bundle)return;
  const totals=state.bundle.report.totals,done=state.bundle.cases.filter(c=>caseReview(c.id).status==='done').length,count=state.bundle.cases.length;
  const delta=state.bundle.report.comparison?.comparable?state.bundle.report.comparison.delta:null;
  const change=(value,label)=>value===undefined?label:`<span class="${value<=0?'positive':''}">${value<0?'↓':value>0?'↑':'—'} ${Math.abs(value)}</span> so với baseline`;
  const card=(label,name,value,foot,progress='')=>`<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(name)}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div>${progress}</div>`;
  $('#stats').innerHTML=card('Tiến độ của bạn','checkCircle',`${done}<small>/ ${count} ca</small>`,`${count-done} ca còn lại`,`<div class="progress-track"><span style="width:${count?done/count*100:0}%"></span></div>`)
    +card('Cảnh báo thừa','flag',totals.fp??'—',change(delta?.fp,'Theo nhãn kỳ vọng'))
    +card('Vấn đề bị bỏ sót','search',totals.fn??'—',change(delta?.fn,'Bao gồm sai loại cảnh báo'))
    +card('Precision','target',pct(totals.precision),`<span class="tiny-label">Nhãn đề xuất</span> F1 ${pct(totals.f1)}`);
}
function renderList(){
  const items=visibleCases();$('#case-count').textContent=`${items.length}`;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===state.filter));
  $('#case-list').innerHTML=items.length?items.map(c=>{
    const index=state.bundle.cases.findIndex(item=>item.id===c.id),review=caseReview(c.id),done=review.status==='done';
    const target=c.tags.find(t=>/^[A-Z]+-\d+$/.test(t))??'CA ĐẶC BIỆT';
    const errors=(c.score?.fp??0)+(c.score?.fn??0);
    return `<button class="case-item ${c.id===state.caseId?'active':''}" data-case="${escape(c.id)}" aria-current="${c.id===state.caseId?'true':'false'}"><div class="case-meta"><span class="case-num">${String(index+1).padStart(2,'0')}</span><span class="case-rule">${escape(target)}</span><span class="case-check ${done?'done':''}" aria-label="${done?'Đã duyệt':'Chưa duyệt'}">${icon(done?'checkCircle':'circle')}</span></div><span class="case-title">${escape(c.title)}</span><div class="case-bottom"><span>${c.result?.flags.length??0} cảnh báo</span><span class="${errors?'mistakes':'ok'}">${c.error?'Lỗi API':errors?`${c.score?.fp??0} thừa · ${c.score?.fn??0} sót`:'Khớp nhãn'}</span></div></button>`;
  }).join(''):`<div class="empty-state">Không có ca phù hợp.<br>Thử đổi bộ lọc.</div>`;
}
function renderDocument(){
  const c=current();if(!c)return;const pageCount=c.pages.length;
  $('#document-header').innerHTML=`<div class="doc-titlebar"><div class="section-kicker">${icon('file')} HỢP ĐỒNG ĐỐI CHIẾU</div><h2>${escape(c.title)}</h2><div class="chips"><span class="chip">Mô phỏng</span><span class="chip ${c.all_pages_confirmed?'green':'amber'}">${c.all_pages_confirmed?'Đã đủ trang':'Chưa đủ trang'}</span><span class="chip purple">${escape(c.id)}</span></div></div><div class="doc-toolbar"><div class="segmented"><button data-view="text" class="${state.view==='text'?'selected':''}">Văn bản</button><button data-view="image" class="${state.view==='image'?'selected':''}">Ảnh gốc</button></div><label class="page-select">Trang <select id="page-select" aria-label="Trang hợp đồng">${c.pages.map((_,i)=>`<option value="${i}" ${state.page===i?'selected':''}>${i+1} / ${pageCount}</option>`).join('')}</select></label></div>`;
  const flag=state.tab==='ai'?currentFlag():null;
  const page=c.result?.pages[state.page];
  const highlight=new Set(flag?.line_ids??[]);
  const lines=page?.lines??c.pages[state.page].map((raw_text,i)=>({id:`p${state.page+1}-L${i+1}`,raw_text}));
  if(state.view==='text'){
    $('#document-body').innerHTML=`<div class="paper"><div class="paper-top"><span>${page?'VĂN BẢN OCR':'VĂN BẢN MẪU'}</span><span>TRANG ${String(state.page+1).padStart(2,'0')}</span></div>${lines.map((line,i)=>`<div class="ocr-line ${highlight.has(line.id)?'highlight':''}" data-line="${escape(line.id)}"><span class="line-no" title="${escape(line.id)}">${String(i+1).padStart(2,'0')}</span><span class="line-text">${escape(line.raw_text)}</span></div>`).join('')}</div><div class="doc-bottom-note">${icon('info')}<span>${flag?.line_ids.length?'Vùng tím là các dòng AI trích dẫn, chưa xác nhận cảnh báo đúng.':'Đọc toàn bộ hợp đồng và phụ lục trước khi kết luận thiếu.'}</span></div>`;
  }else{
    const overlays=page?.lines.filter(l=>highlight.has(l.id)).map(l=>{
      const xs=l.polygon.map(p=>p.x),ys=l.polygon.map(p=>p.y);
      return `<div class="image-overlay" style="left:${Math.min(...xs)*100}%;top:${Math.min(...ys)*100}%;width:${(Math.max(...xs)-Math.min(...xs))*100}%;height:${(Math.max(...ys)-Math.min(...ys))*100}%"></div>`;
    }).join('')??'';
    $('#document-body').innerHTML=`<div class="image-controls"><span>${state.zoom}% · Khung từ tọa độ OCR</span><button class="icon-button" data-action="zoom-out" aria-label="Thu nhỏ">${icon('minus')}</button><button class="icon-button" data-action="zoom-in" aria-label="Phóng to">${icon('plus')}</button></div><div class="image-wrap" style="width:${state.zoom}%"><img id="contract-image" alt="Ảnh hợp đồng mô phỏng, trang ${state.page+1}" src="/api/runs/${encodeURIComponent(state.run)}/images/${encodeURIComponent(c.id)}/${state.page+1}">${overlays}</div><div id="image-error" class="image-error" hidden>Không có ảnh đã lưu cho trang này. Chuyển sang Văn bản để tiếp tục đối chiếu.</div>`;
    $('#contract-image').addEventListener('error',()=>{$('.image-wrap').hidden=true;$('#image-error').hidden=false;});
  }
}
function renderReview(){
  const c=current();if(!c)return;const review=caseReview(c.id);const flags=c.result?.flags??[];
  $('#review-header').innerHTML=`<div class="review-top"><div class="review-top-row"><h2>Phiếu đánh giá</h2><span class="pill ${review.status==='done'?'done':''}">${review.status==='done'?icon('check'):''}${review.status==='done'?'Đã duyệt':'Chưa hoàn tất'}</span></div><div class="review-tabs"><button class="${state.tab==='ai'?'selected':''}" data-tab="ai">Cảnh báo AI <small>${flags.length}</small></button><button class="${state.tab==='gold'?'selected':''}" data-tab="gold">Nhãn kỳ vọng <small>${c.expected.length}</small></button></div></div>`;
  if(state.tab==='gold')renderGold(c,review);
  else if(!flags.length){
    $('#review-body').innerHTML=`<div class="empty-state">${icon(c.error?'warning':'checkCircle')}<strong>${c.error?'Lượt phân tích bị lỗi':'AI không sinh cảnh báo'}</strong>${c.error?escape(c.error):c.expected.length?`Nhãn kỳ vọng có ${c.expected.length} vấn đề. Kiểm tra hợp đồng để xác nhận có bị bỏ sót không.`:'Ca này cũng không có cảnh báo trong nhãn kỳ vọng. Hãy đọc nguồn và xác nhận trước khi hoàn tất.'}<p><button class="button" data-tab="gold">Rà soát nhãn kỳ vọng ${icon('arrowRight')}</button></p></div><label class="field-label" for="omitted-notes">Vấn đề bị bỏ sót / ghi chú ca</label><textarea id="omitted-notes" class="notes" data-case-field="omitted_issue_notes" placeholder="Ghi điều khoản hoặc vấn đề AI chưa phát hiện…">${escape(review.omitted_issue_notes)}</textarea>`;
  }else{
    const f=flags[state.flagIndex],scores=flagReview(f.id);
    const match=c.score?.matches?.find(m=>m.prediction_index===state.flagIndex);
    const sameRule=c.expected.find(g=>g.rule_id===f.rule_id);
    const auto=match?'Khớp nhãn tự động':sameRule&&sameRule.type!==f.type?`Sai loại theo nhãn · kỳ vọng ${types[sameRule.type]}`:'Ngoài nhãn kỳ vọng';
    const rating=(field,label,tip)=>`<div class="rating-row"><span title="${escape(tip)}">${label}</span><div class="rating-options" role="group" aria-label="${label}">${[0,1,2].map(n=>`<button data-rating="${field}" data-value="${n}" class="${scores[field]===n?'selected':''}" aria-pressed="${scores[field]===n}" title="${n}: ${n===0?'Không đạt':n===1?'Cần sửa':'Đạt'}">${n}</button>`).join('')}</div></div>`;
    $('#review-body').innerHTML=`<div class="flag-nav"><select id="flag-select" aria-label="Cảnh báo đang chấm">${flags.map((flag,i)=>`<option value="${i}" ${i===state.flagIndex?'selected':''}>${String(i+1).padStart(2,'0')} / ${flags.length} · ${escape(flag.rule_id)} ${caseReview(c.id).flags[flag.id]?.semantic_correctness!==undefined&&caseReview(c.id).flags[flag.id]?.semantic_correctness!==null?'✓':''}</option>`).join('')}</select><div class="flag-nav-actions"><button class="icon-button" data-action="prev-flag" ${state.flagIndex===0?'disabled':''} aria-label="Cảnh báo trước">${icon('arrowLeft')}</button><button class="icon-button" data-action="next-flag" ${state.flagIndex===flags.length-1?'disabled':''} aria-label="Cảnh báo tiếp theo">${icon('arrowRight')}</button></div></div>
      <div class="flag-chips"><span class="rule-badge">${escape(f.rule_id)}</span><span class="severity">Mức ${severity[f.severity]}</span><span class="type-label">${types[f.type]}</span></div><h3 class="flag-title">${escape(f.title)}</h3><div class="auto-result ${match?'good':''}">${icon(match?'checkCircle':'warning')}${escape(auto)}</div>
      ${f.quote?`<blockquote class="quote-box"><p>“${escape(f.quote)}”</p><button class="text-link" data-action="show-evidence">${icon('eye')} Đối chiếu dòng trích dẫn</button></blockquote>`:`<div class="quote-box"><p>Cảnh báo thiếu điều khoản không có câu trích cụ thể.</p></div>`}
      <div class="field-label">GIẢI THÍCH CỦA AI</div><p class="explanation">${escape(f.explanation)}</p><div class="field-label">CÂU HỎI GỢI Ý</div><p class="question-box">${escape(f.question_for_landlord)}</p>
      <div class="scoring"><h3>${icon('edit')} Đánh giá của bạn</h3><div class="verdict" role="group" aria-label="Cảnh báo có đúng không">${[[0,'Sai','close'],[1,'Một phần','minus'],[2,'Đúng','check']].map(([n,label,ico])=>`<button data-rating="semantic_correctness" data-value="${n}" class="${scores.semantic_correctness===n?'selected':''}" aria-pressed="${scores.semantic_correctness===n}">${icon(ico)}${label}</button>`).join('')}</div>
      ${rating('explanation_faithfulness','Giải thích bám hợp đồng','0: bịa/sai; 1: cần sửa; 2: bám nguồn, đúng phạm vi')}${rating('actionable_question','Câu hỏi hữu ích','0: sai vấn đề; 1: chung chung; 2: lịch sự, cụ thể, gửi được')}${rating('plain_vietnamese','Diễn đạt dễ hiểu','0: khó hiểu; 1: cần rút gọn; 2: rõ, phù hợp sinh viên')}
      <div class="rating-row"><span>Vùng tô ảnh đúng?</span><div class="rating-options boolean" role="group" aria-label="Vùng tô ảnh đúng">${[[true,'Có'],[false,'Không'],[null,'N/A']].map(([v,label])=>`<button data-highlight="${v}" class="${scores.visual_highlight_correct===v?'selected':''}" aria-pressed="${scores.visual_highlight_correct===v}">${label}</button>`).join('')}</div></div>
      <label class="field-label" for="flag-notes">Ghi chú cho cảnh báo này</label><textarea id="flag-notes" class="notes" data-flag-notes placeholder="Vì sao đúng hoặc sai? Cần sửa điều gì?">${escape(scores.notes)}</textarea></div>`;
  }
  renderFooter();
}
function renderGold(c,review){
  $('#review-body').innerHTML=`<p class="explanation">Đây là nhãn đề xuất. Duyệt dựa trên hợp đồng, không dựa vào việc AI có đồng ý hay không.</p><div class="field-label">${c.expected.length} VẤN ĐỀ KỲ VỌNG</div>${c.expected.length?c.expected.map(g=>`<article class="gold-card"><h3><span class="rule-badge">${escape(g.rule_id)}</span><span>${types[g.type]}</span><span class="type-label">${severity[g.severity]}</span></h3><p>${escape(g.rationale)}</p>${g.evidence_any_of.map(e=>`<div class="gold-evidence">Trang ${e.page} · “${escape(e.contains)}”</div>`).join('')}</article>`).join(''):`<div class="gold-card"><p>${icon('checkCircle')} Không có vấn đề kỳ vọng trong phạm vi 8 quy tắc.</p></div>`}
    <div class="field-label">Bạn có đồng ý với bộ nhãn này?</div><div class="label-decisions"><button data-label-decision="agree" class="${review.label_decision==='agree'?'selected':''}">${icon('check')} Đồng ý nhãn</button><button data-label-decision="change" class="${review.label_decision==='change'?'selected':''}">${icon('edit')} Cần sửa nhãn</button></div>
    <label class="field-label" for="label-notes">Đề xuất sửa nhãn ${review.label_decision==='change'?'· bắt buộc':''}</label><textarea id="label-notes" class="notes" data-case-field="label_notes" placeholder="Quy tắc nào cần thêm/bỏ? Đổi loại hoặc mức độ? Ghi rõ câu làm bằng chứng…">${escape(review.label_notes)}</textarea>
    <label class="field-label" for="omitted-notes">Vấn đề AI bỏ sót / ghi chú ca</label><textarea id="omitted-notes" class="notes" data-case-field="omitted_issue_notes" placeholder="Ghi vấn đề cần xem lại trong hợp đồng…">${escape(review.omitted_issue_notes)}</textarea><p class="footer-hint">Đề xuất được lưu trong phiếu duyệt. Nhãn benchmark gốc không bị sửa tự động.</p>`;
}
function completion(){
  const c=current();if(!c)return{ready:false,hint:''};const r=caseReview(c.id);
  const flags=c.result?.flags??[];
  const remaining=flags.filter(f=>{const s=r.flags[f.id];return !s||[s.semantic_correctness,s.explanation_faithfulness,s.actionable_question,s.plain_vietnamese].some(n=>n===null);}).length;
  if(remaining)return{ready:false,hint:`Còn ${remaining} cảnh báo cần chấm đủ 4 tiêu chí.`};
  if(r.label_decision==='pending')return{ready:false,hint:'Chuyển sang Nhãn kỳ vọng để xác nhận hoặc đề xuất sửa.'};
  if(r.label_decision==='change'&&!r.label_notes.trim())return{ready:false,hint:'Ghi rõ đề xuất sửa nhãn trước khi hoàn tất.'};
  return{ready:true,hint:r.status==='done'?'Ca này đã được bạn duyệt. Có thể sửa lại bất kỳ lúc nào.':'Đã đủ thông tin để hoàn tất ca này.'};
}
function renderFooter(){
  if(!current())return;const {ready,hint}=completion();const done=caseReview(state.caseId).status==='done';
  $('#review-footer').innerHTML=`<div class="footer-actions"><button class="button" data-action="save">${icon('download')} Lưu nháp</button><button class="button primary" data-action="complete" ${!ready?'disabled':''}>${icon(done?'arrowRight':'check')}${done?'Ca tiếp theo':'Hoàn tất ca'}</button></div><p class="footer-hint">${escape(hint)}</p>`;
}
function selectFlag(index){state.flagIndex=index;const f=currentFlag();const page=current()?.result?.pages.findIndex(p=>p.lines.some(l=>f?.line_ids.includes(l.id)));if(page>=0)state.page=page;renderDocument();renderReview();$('#review-body').scrollTop=0;}
function modal(title,html){$('#modal-title').textContent=title;$('#modal-content').innerHTML=html;$('#modal').showModal();}
function guide(){modal('Chấm thế nào cho nhất quán?',`<p>Đọc hợp đồng trước, sau đó đánh giá từng cảnh báo. Nhãn hiện tại là đề xuất, không mặc nhiên là đáp án đúng.</p><table><thead><tr><th>Tiêu chí</th><th>0 · Không đạt</th><th>1 · Cần sửa</th><th>2 · Đạt</th></tr></thead><tbody><tr><td>Cảnh báo đúng?</td><td>Sai vấn đề</td><td>Đúng một phần</td><td>Đúng điều khoản, đúng phạm vi</td></tr><tr><td>Giải thích</td><td>Bịa hoặc trái nguồn</td><td>Còn suy diễn</td><td>Bám hợp đồng, nêu đúng phần chưa chắc</td></tr><tr><td>Câu hỏi</td><td>Sai vấn đề</td><td>Chung chung</td><td>Lịch sự, cụ thể, gửi được</td></tr><tr><td>Diễn đạt</td><td>Khó hiểu</td><td>Cần rút gọn</td><td>Rõ ràng, dễ hiểu</td></tr></tbody></table><h3>Trước khi hoàn tất một ca</h3><ul><li>Chấm đủ 4 tiêu chí cho từng cảnh báo AI.</li><li>Xem tab <strong>Nhãn kỳ vọng</strong> và chọn đồng ý hoặc cần sửa.</li><li>Nếu cần sửa nhãn, ghi đề xuất cụ thể và bằng chứng.</li><li>Vùng tô ảnh chưa kiểm tra hoặc không áp dụng thì để N/A.</li></ul><h3>Dữ liệu được lưu ở đâu?</h3><p>Phiếu được tự lưu trên máy, riêng theo lượt chạy và tên người duyệt. Nhãn gốc và kết quả AI giữ nguyên. Nút Xuất phiếu tải JSON gồm điểm, ghi chú, nguồn và dự đoán để nhóm tổng hợp. Tên người duyệt là định danh cục bộ, không phải tài khoản đăng nhập.</p><p>Đánh dấu “Hoàn tất ca” chỉ ghi nhận tiến độ của người đang duyệt; không tự chứng nhận nhãn đã được hai người thông qua.</p>`);}
function overview(){if(!state.bundle)return;const t=state.bundle.report.totals;modal('Kết quả lượt chạy',`<p><strong>${escape(state.runs.find(r=>r.id===state.run)?.model)}</strong> · ${escape(date(state.bundle.report.created_at))}<br>${escape(state.bundle.report.dataset_version)} · ${t.completed}/${t.cases} ca hoàn tất · ${t.failed} ca lỗi</p><table><thead><tr><th>Quy tắc</th><th>Đúng</th><th>Thừa</th><th>Sót</th><th>Precision</th><th>Recall</th></tr></thead><tbody>${Object.entries(t.by_rule??{}).map(([rule,r])=>`<tr><td>${escape(rule)}</td><td>${r.tp}</td><td>${r.fp}</td><td>${r.fn}</td><td>${pct(r.precision)}</td><td>${pct(r.recall)}</td></tr>`).join('')}</tbody></table><p>Precision ${pct(t.precision)} · Recall ${pct(t.recall)} · F1 ${pct(t.f1)}.</p><p>Các chỉ số là kết quả chấm tự động theo nhãn đề xuất. Điểm người duyệt được lưu riêng, không tự thay đổi báo cáo này.</p>`);}
function exportReview(){
  if(!state.document)return;
  const exported={format:'leaselens-review-v1',run_id:state.run,reviewer,revision:state.document.revision,dataset_hash:state.document.dataset_hash,exported_at:new Date().toISOString(),unsaved_changes:state.dirty,cases:state.bundle.cases.map(c=>{
    const r=caseReview(c.id);return{case_id:c.id,source:c.pages,expected:c.expected,...r,flags:(c.result?.flags??[]).map(f=>({prediction:f,scores:{...r.flags[f.id]??blankFlag()},notes:r.flags[f.id]?.notes??''})),provider_error:c.error};
  })};
  const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`benchmark-review-${state.run}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(state.dirty?'Đã xuất bản nháp gồm thay đổi chưa lưu.':'Đã xuất phiếu duyệt JSON.');
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try {
    if(button.dataset.case){chooseCase(button.dataset.case);return;}
    if(button.dataset.filter){state.filter=button.dataset.filter;renderList();return;}
    if(button.dataset.view){state.view=button.dataset.view;renderDocument();return;}
    if(button.dataset.tab){state.tab=button.dataset.tab;renderDocument();renderReview();return;}
    if(button.dataset.rating){const field=button.dataset.rating,value=Number(button.dataset.value);editFlag({[field]:flagReview(currentFlag().id)[field]===value?null:value});renderReview();return;}
    if('highlight' in button.dataset){editFlag({visual_highlight_correct:button.dataset.highlight==='true'?true:button.dataset.highlight==='false'?false:null});renderReview();return;}
    if(button.dataset.labelDecision){editCase({label_decision:button.dataset.labelDecision});renderReview();return;}
    switch(button.dataset.action){
      case 'save':await save();notice('Đã lưu phiếu duyệt trên máy.');break;
      case 'complete':if(caseReview(state.caseId).status==='done'){nextCase();break;}if(!completion().ready)return;state.document.cases[state.caseId]={...caseReview(state.caseId),status:'done'};markDirty();await save();renderReview();notice('Đã hoàn tất ca. Điểm và ghi chú đã được lưu.');break;
      case 'prev-flag':selectFlag(state.flagIndex-1);break;
      case 'next-flag':selectFlag(state.flagIndex+1);break;
      case 'show-evidence':{const f=currentFlag();const page=current().result.pages.findIndex(p=>p.lines.some(l=>f.line_ids.includes(l.id)));if(page>=0)state.page=page;renderDocument();$('.ocr-line.highlight')?.scrollIntoView({block:'center',behavior:'smooth'});break;}
      case 'zoom-in':state.zoom=Math.min(250,state.zoom+25);renderDocument();break;
      case 'zoom-out':state.zoom=Math.max(100,state.zoom-25);renderDocument();break;
      case 'export':exportReview();break;
      case 'guide':guide();break;
      case 'overview':overview();break;
      case 'close-modal':$('#modal').close();break;
      case 'review-home':$('#workspace').scrollIntoView({behavior:'smooth'});break;
    }
  }catch(error){notice(error.message,true);}
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='search'){state.query=el.value;renderList();}
  else if(el.hasAttribute('data-flag-notes'))editFlag({notes:el.value});
  else if(el.dataset.caseField)editCase({[el.dataset.caseField]:el.value});
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='run-select')void openRun(el.value);
  if(el.id==='page-select'){state.page=Number(el.value);renderDocument();}
  if(el.id==='flag-select')selectFlag(Number(el.value));
  if(el.id==='only-errors'){state.onlyErrors=el.checked;renderList();}
  if(el.id==='reviewer-name'){const name=el.value.trim();if(!name){el.value=reviewer;notice('Nhập tên người duyệt để tách riêng phiếu.');}else if(state.run)void openRun(state.run,name);}
});
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('#modal').open)return;
  if(event.key==='ArrowRight'){event.preventDefault();nextCase();}
  if(event.key==='ArrowLeft'){event.preventDefault();nextCase(-1);}
});
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
async function init(){
  try {
    const {runs}=await request('/api/runs');state.runs=runs;
    if(!runs.length){$('#run-select').innerHTML='<option>Chưa có lượt chạy</option>';$('#stats').innerHTML='<div class="loading-block">Chưa có báo cáo hoàn tất. Chạy npm run benchmark -- --mode live trước khi duyệt.</div>';return;}
    $('#run-select').innerHTML=runs.map(r=>`<option value="${escape(r.id)}">${escape(date(r.created_at))} · ${r.mode==='saved'?'Chấm lại':r.prompt_version.endsWith('v3')?'Prompt v3':r.prompt_version.endsWith('v2')?'Baseline v2':r.mode}</option>`).join('');
    const requested=new URL(location.href).searchParams.get('run');
    const run=runs.find(r=>r.id===requested)??runs.find(r=>r.mode==='live')??runs[0];await openRun(run.id);
  }catch(error){notice(error.message,true);$('#stats').innerHTML=`<div class="loading-block">${escape(error.message)} · Tải lại trang để thử lại.</div>`;}
}
void init();
