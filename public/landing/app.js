'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);
const STORAGE_KEY = 'value-lens-demo-v1';
const THEMES = ['forest', 'ink', 'clay', 'plum'];
let storageAvailable = true;
let toastTimer;
let step = 0;
let currentOrg = 'care';

const samples = {
  care: {
    name: '햇살돌봄 사회적협동조합', description: '홀몸 어르신의 일상을 돌보는 조직',
    file: '햇살돌봄_사업계획과활동기록.pdf', documentTitle: '홀몸 어르신 방문 돌봄',
    paragraphs: [
      '우리 동네 홀몸 어르신은 일상에서 도움을 요청할 관계가 부족합니다. 햇살돌봄은 정기적인 방문으로 돌봄의 빈틈을 채웁니다.',
      '돌봄 활동가가 어르신을 찾아가 안부를 확인하고, 생활 지원과 필요한 지역 자원을 연결합니다.',
      '2026년 체험용 활동기록: 중복을 제외한 어르신 118명에게 방문 돌봄 864회를 제공했습니다. 기간 말 자격·교육 요건을 갖춘 재직 돌봄 인력은 12명입니다. 고립감 변화 설문은 아직 진행하지 않았습니다.'
    ],
    toc: [
      ['문제', '홀몸 어르신이 일상에서 도움받을 관계가 부족해요.', 0],
      ['활동', '정기 방문으로 안부를 확인하고 생활을 지원해요.', 1],
      ['산출', '118명에게 방문 돌봄 864회를 제공했어요.', 2],
      ['기대 변화', '도움을 요청할 관계가 생기고 고립감이 줄어들어요.', null]
    ],
    question: '방문 전후, 어르신이 느끼는 고립감은 어떻게 달라졌을까요?',
    metrics: [
      { id:'care_people', title:'돌봄을 받은 사람 수', unit:'명', type:'count', target:120, actual:118, evidence:'가상 활동기록 · 대상자 중복 제거', method:'같은 사람이 여러 번 이용해도 한 명으로 집계합니다.', category:'도달 범위' },
      { id:'care_visits', title:'방문 돌봄 횟수', unit:'회', type:'count', target:960, actual:864, evidence:'가상 활동기록 · 완료한 방문 건수', method:'완료된 방문 건수를 합산합니다. 취소한 방문은 제외합니다.', category:'활동 산출' },
      { id:'care_change', title:'고립감이 줄었다고 답한 비율', unit:'%', type:'rate', target:70, numerator:null, denominator:null, evidence:'', method:'고립감 감소 응답자 ÷ 유효 응답자 × 100. 사전·사후 질문 기준을 맞춰 확인합니다.', category:'변화 확인' },
      { id:'care_staff', title:'자격 요건을 갖춘 돌봄 인력 수', unit:'명', type:'count', target:12, actual:12, evidence:'가상 기간 말 재직 명부 · 자격·교육 이수 기록', method:'기간 말 고용 중인 인력 가운데 현지 면허·자격·교육 요건을 충족한 사람을 집계합니다.', category:'제공 역량' }
    ]
  },
  jobs: {
    name: '다시봄 일터', description: '일할 기회와 안정적인 고용을 만드는 사회적기업',
    file: '다시봄_사업계획과활동기록.pdf', documentTitle: '직무교육과 일자리 지원',
    paragraphs: [
      '취업에 어려움을 겪는 지역 주민에게 안정적인 일 경험이 필요합니다. 다시봄은 직무교육과 일자리를 함께 제공합니다.',
      '참여자는 직무교육 후 실제 업무를 수행하며 적응 지원을 받습니다. 단기 채용을 넘어 고용의 지속 여부를 확인하려 합니다.',
      '2026년 체험용 활동기록: 신규 채용 24명, 직무교육 192시간을 기록했습니다. 채용 후 6개월이 지난 20명 중 17명이 재직 중입니다.'
    ],
    toc: [
      ['문제', '취업이 어려운 주민에게 안정적인 일 경험이 필요해요.', 0],
      ['활동', '직무교육과 채용, 업무 적응 지원을 함께 제공해요.', 1],
      ['산출', '24명 채용, 교육 192시간, 6개월 고용유지 17/20명.', 2],
      ['기대 변화', '일자리가 유지되고 생활의 안정성이 높아져요.', null]
    ],
    question: '고용 유지가 참여자의 생활 안정으로 이어졌는지도 확인하고 있나요?',
    metrics: [
      { id:'jobs_people', title:'신규 채용 인원', unit:'명', type:'count', target:30, actual:24, evidence:'가상 채용기록 · 중복 제외', method:'기간 내 신규 채용한 인원을 중복 없이 집계합니다.', category:'도달 범위' },
      { id:'jobs_hours', title:'직무교육 운영 시간', unit:'시간', type:'count', target:240, actual:192, evidence:'가상 교육일지 · 운영시간 합계', method:'진행한 교육 회차별 시간을 합산합니다. 인원수를 곱하지 않습니다.', category:'활동 산출' },
      { id:'jobs_retention', title:'6개월 고용유지율', unit:'%', type:'rate', target:80, numerator:17, denominator:20, evidence:'가상 재직기록 · 6개월 경과자 기준', method:'6개월 이상 재직자 ÷ 입사 후 6개월이 지난 채용자 × 100.', category:'변화 확인' }
    ]
  },
  reuse: {
    name: '다시쓰임 순환공방', description: '버려질 물건의 다음 쓰임을 만드는 사회적기업',
    file: '다시쓰임_사업계획과활동기록.pdf', documentTitle: '생활용품 수거와 재사용',
    paragraphs: [
      '아직 쓸 수 있는 생활용품이 폐기되고 있습니다. 다시쓰임은 지역의 물품을 수거하고 수선해 재사용을 돕습니다.',
      '수거한 물품은 무게를 기록하고 선별·수선합니다. 판매·기부 등 실제로 다시 쓰인 물품을 따로 기록합니다.',
      '2026년 체험용 활동기록: 물품 4,200kg을 수거했고, 780점을 재사용으로 연결했습니다. 수거 물량 중 재사용된 무게는 아직 집계하지 않았습니다.'
    ],
    toc: [
      ['문제', '사용할 수 있는 생활용품이 폐기되고 있어요.', 0],
      ['활동', '물품을 수거·선별·수선해 다시 쓰이도록 연결해요.', 1],
      ['산출', '4,200kg을 수거하고 물품 780점을 재사용했어요.', 2],
      ['기대 변화', '제품 수명이 늘어나고 폐기되는 자원이 줄어요.', null]
    ],
    question: '수거량 중 실제로 재사용된 무게를 별도로 남기고 있나요?',
    metrics: [
      { id:'reuse_weight', title:'물품 수거량', unit:'kg', type:'amount', target:5000, actual:4200, evidence:'가상 수거일지 · 무게 합계', method:'같은 물품을 중복 집계하지 않고 수거 시 무게를 더합니다.', category:'도달 범위' },
      { id:'reuse_items', title:'재사용으로 연결한 물품', unit:'점', type:'count', target:1000, actual:780, evidence:'가상 판매·기부 기록 · 완료 건', method:'판매·기부 등으로 실제 재사용된 물품 수를 집계합니다.', category:'활동 산출' },
      { id:'reuse_rate', title:'수거량 대비 재사용률', unit:'%', type:'rate', rateUnit:'kg', target:75, numerator:null, denominator:4200, evidence:'', method:'재사용된 물품의 무게 ÷ 전체 수거 무게 × 100. 탄소감축량과는 다른 지표입니다.', category:'변화 확인' }
    ]
  }
};

function freshMetric(metric) { return {...metric, selected:true, reviewed:false, manual:false}; }
const state = Object.fromEntries(Object.entries(samples).map(([id, sample]) => [id, sample.metrics.map(freshMetric)]));
try {
  const rememberedTheme = localStorage.getItem('value-lens-theme');
  if (THEMES.includes(rememberedTheme)) document.documentElement.dataset.theme = rememberedTheme;
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const org of Object.keys(samples)) {
      if (!Array.isArray(saved[org])) continue;
      state[org] = samples[org].metrics.map(metric => {
        const old = saved[org].find(item => item?.id === metric.id);
        const restored = freshMetric(metric);
        if (!old) return restored;
        for (const key of ['target','actual','numerator','denominator']) {
          if (key in old && (old[key] === null || (typeof old[key] === 'number' && Number.isFinite(old[key]) && old[key] >= 0 && old[key] <= 1e9))) restored[key] = old[key];
        }
        if (restored.target === null || restored.target <= 0 || (metric.type === 'rate' && restored.target > 100)) restored.target = metric.target;
        for (const key of ['selected','reviewed','manual']) if (typeof old[key] === 'boolean') restored[key] = old[key];
        if (typeof old.evidence === 'string') restored.evidence = old.evidence.slice(0,180);
        return restored;
      });
    }
  }
} catch { storageAvailable = false; }

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#save-state').textContent = storageAvailable ? '변경 내용이 이 브라우저에 저장되었습니다.' : '브라우저 저장이 제한되어 있습니다. 보고서를 내려받아 보관하세요.';
}
function updateThemeButtons() { $$('[data-theme-choice]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === document.documentElement.dataset.theme))); }
updateThemeButtons();
$('#theme-trigger').addEventListener('click', () => { const isOpen = $('#theme-trigger').getAttribute('aria-expanded') === 'true'; $('#theme-trigger').setAttribute('aria-expanded', String(!isOpen)); $('#theme-panel').hidden = isOpen; });
$$('[data-theme-choice]').forEach(btn => btn.addEventListener('click', () => {
  const theme = btn.dataset.themeChoice;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('value-lens-theme', theme); } catch { /* Theme still works without persistence. */ }
  updateThemeButtons();
  const colors = {forest:'#f7f7f0',ink:'#f3f5f6',clay:'#faf4ed',plum:'#f8f3f6'};
  $('meta[name="theme-color"]').setAttribute('content',colors[theme]);
  notify(`${btn.textContent.trim().split(' ')[0]} 컬러를 적용했습니다.`);
}));
document.addEventListener('click', event => { if (!event.target.closest('.theme-panel,.theme-trigger')) { $('#theme-panel').hidden = true; $('#theme-trigger').setAttribute('aria-expanded','false'); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#theme-panel').hidden) { $('#theme-panel').hidden = true; $('#theme-trigger').setAttribute('aria-expanded','false'); $('#theme-trigger').focus(); } });

const features = [
  { title:'가지고 있는 문서로 시작해요.', copy:'소개서나 사업계획서에서 누구를 위해 어떤 일을 하는지 찾아요. 결과 옆에서 원문도 함께 볼 수 있어요. 지금은 미리 준비한 샘플로 체험해 보세요.', status:'샘플 분석 · 실제 업로드 연동 예정', step:0,
    visual:'<figure class="feature-artwork"><img src="/landing/images/report-flow.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="흩어진 문서가 한 권의 보고서로 모이는 과정을 표현한 종이 콜라주"><figcaption><span>문서</span><i aria-hidden="true">→</i><span>지표</span><i aria-hidden="true">→</i><span>기록</span><i aria-hidden="true">→</i><span>보고서</span></figcaption></figure>' },
  { title:'활동과 변화를 정리해요.', copy:'누구에게 어떤 어려움이 있는지, 우리가 무엇을 하는지, 무엇이 달라지길 바라는지 정리해요. 문서에 있는 사실과 아직 확인이 필요한 내용을 나눠서 봐요.', status:'변화이론 샘플 체험', step:0,
    visual:'<div class="mini-flow"><div><small>문제</small> 도움을 요청할 관계가 부족하다</div><span>↓</span><div><small>활동</small> 정기 방문과 생활 지원</div><span>↓</span><div><small>산출</small> 방문 횟수 · 돌봄을 받은 사람 수</div><span>↓</span><div class="last"><small>기대 변화</small> 관계 형성 · 고립감 감소</div></div>' },
  { title:'맞는 기준과 지표를 골라요.', copy:'IRIS+ 지표의 뜻과 세는 방법을 확인하고, 관련된 SDGs 목표도 살펴봐요. 우리 조직이 직접 정한 지표는 따로 표시해요. 필요한 지표를 고르고 목표를 입력해 보세요.', status:'기준 확인 · 지표 선택 · 목표 수정', step:1,
    visual:'<div class="mini-metrics"><div><span>돌봄을 받은 사람 수<small>IRIS+ PI4060 · 중복 없는 이용자</small></span><b>120<small>명 / 목표</small></b></div><div><span>자격 요건을 갖춘 돌봄 인력<small>IRIS+ OI5323 · 기간 말 재직</small></span><b>12<small>명 / 목표</small></b></div><div><span>고립감 감소 응답 비율<small>조직 자체 지표 · 별도 설문</small></span><b>70<small>% / 목표</small></b></div></div>' },
  { title:'담당자가 확인하고 정해요.', copy:'필요 없는 지표는 빼고, 목표와 계산 방법을 확인한 뒤 확정해요. 담당자가 확인했는지도 보고서에 함께 표시돼요.', status:'채택 · 제외 · 검토 확정 가능', step:1,
    visual:'<div class="mini-review"><span>담당자 검토 대기</span><h4>우리에게 필요한<br>지표인가요?</h4><p>실제로 수집할 수 있는 자료인지,<br>우리 사업의 변화를 보여주는지 확인하세요.</p><footer><i>검토 후 확정 ✓</i><i>목표 수정</i></footer></div>' },
  { title:'숫자와 출처를 같이 적어요.', copy:'실적을 입력하고 어디서 확인한 숫자인지 적어요. 비율은 전체 수와 해당하는 수를 넣으면 계산돼요. 자료가 없으면 0 대신 ‘미확인’으로 남겨요.', status:'실적 입력 · 계산 · CSV 가져오기', step:2,
    visual:'<figure class="feature-artwork"><img src="/landing/images/evidence-trace.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="문서에서 확인한 내용과 원문을 연결하는 돋보기와 실의 콜라주"><figcaption><span>기록한 숫자</span><i aria-hidden="true">↔</i><span>확인한 자료</span><i aria-hidden="true">↔</i><span>원문 출처</span></figcaption></figure>' },
  { title:'기록한 내용으로 보고서를 만들어요.', copy:'선택한 지표, 목표, 실적, 달성률과 출처를 보고서로 모아줘요. 보고서와 기록 파일을 내려받아 담당자나 동료와 함께 확인할 수 있어요.', status:'보고서 미리보기 · 다운로드 가능', step:2,
    visual:'<div class="mini-report"><p>VALUE LENS / REPORT</p><h4>우리 조직의 변화 기록</h4><table><tr><td>지표</td><td>실적</td><td>상태</td></tr><tr><td>돌봄을 받은 사람</td><td>118명</td><td>근거 있음</td></tr><tr><td>방문 돌봄</td><td>864회</td><td>근거 있음</td></tr><tr><td>고립감 변화</td><td>—</td><td>추가 확인</td></tr></table><p style="margin-top:18px">가상 예시 · 공식 평가 보고서가 아닙니다.</p></div>' }
];
function showFeature(index) {
  const feature = features[index];
  $$('[data-feature]').forEach(btn => { const active = Number(btn.dataset.feature) === index; btn.setAttribute('aria-selected',String(active)); btn.tabIndex = active ? 0 : -1; });
  $('#feature-detail').setAttribute('aria-labelledby', `feature-tab-${index}`);
  $('#feature-detail').innerHTML = `<div class="detail-kicker"><span>FEATURE / 0${index+1}</span><span class="detail-status">${feature.status}</span></div><div class="detail-visual">${feature.visual}</div><h3 class="detail-title">${feature.title}</h3><p class="detail-copy">${feature.copy}</p><a class="detail-link" href="#playground" data-feature-step="${feature.step}">이 기능 직접 체험하기 <span>↗</span></a>`;
}
$$('[data-feature]').forEach(btn => btn.addEventListener('click',()=>showFeature(Number(btn.dataset.feature))));
$('#feature-detail').addEventListener('click', event => { const link=event.target.closest('[data-feature-step]'); if(link) setStep(Number(link.dataset.featureStep)); });
showFeature(0);

function wireTabKeyboard(selector, attr, change) {
  const tabs = $$(selector);
  tabs.forEach((tab,index) => tab.addEventListener('keydown',event=>{
    if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    let next=index;
    if(event.key==='Home') next=0;
    else if(event.key==='End') next=tabs.length-1;
    else next=(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+tabs.length)%tabs.length;
    change(Number(tabs[next].getAttribute(attr))); tabs[next].focus();
  }));
}
wireTabKeyboard('[data-feature]','data-feature',showFeature);
const standardTabs = $$('[data-standard]');
function showStandard(key) {
  standardTabs.forEach(tab => {
    const active = tab.dataset.standard === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`#standard-panel-${tab.dataset.standard}`).hidden = !active;
  });
}
standardTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showStandard(tab.dataset.standard));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? standardTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + standardTabs.length) % standardTabs.length;
    showStandard(standardTabs[next].dataset.standard);
    standardTabs[next].focus();
  });
});
$('#try-standard').addEventListener('click', () => { currentOrg='care';setStep(1); });
$$('[data-story-org]').forEach(link => link.addEventListener('click', () => {
  currentOrg=link.dataset.storyOrg;
  setStep(1);
}));
wireTabKeyboard('[data-step]','data-step',setStep);
$$('[data-step]').forEach(btn=>btn.addEventListener('click',()=>setStep(Number(btn.dataset.step))));
$$('[data-org]').forEach(btn=>btn.addEventListener('click',()=>{ currentOrg=btn.dataset.org; renderDemo(); }));
function setStep(next) { step=next;renderDemo(); }
function renderDemo() {
  const sample=samples[currentOrg];
  $('#org-name').textContent=sample.name;
  $('#org-description').textContent=sample.description;
  $$('[data-org]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.org===currentOrg)));
  $$('[data-step]').forEach(btn=>{const active=Number(btn.dataset.step)===step;btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;});
  $('#demo-content').setAttribute('aria-labelledby',`step-tab-${step}`);
  $('#demo-content').innerHTML=step===0?documentView(sample):step===1?metricView():recordView();
  if(step===2) updateResults();
}
function documentView(sample) {
  return `<div class="document-view"><div class="source-pane"><div class="pane-label"><span>입력 / 원래 있던 문서</span><span>가상 원문</span></div><div class="source-paper"><small>2026 · 사업계획과 활동기록 발췌</small><h3>${sample.documentTitle}</h3>${sample.paragraphs.map((p,i)=>`<p id="source-${i}">${p}</p>`).join('')}<div class="source-page"><span>${sample.name}</span><span>03</span></div></div><p class="sample-filename"><span>PDF</span>${sample.file}</p></div><div class="flow-pane"><div class="pane-label"><span>출력 / 변화의 흐름</span><span>분석 결과 샘플</span></div><h3>이 일은 어떤 변화를 만들까요?</h3>${sample.toc.map(([label,text,source])=>`<div class="toc-row"><span>${label}</span><div><p>${text}</p>${source===null?'<span class="inference-badge">제안된 해석 · 검토 필요</span>':`<button class="source-button" data-source="${source}">↗ 원문 근거 확인</button>`}</div></div>`).join('')}<div class="question-callout"><small>다음에 확인할 질문</small><p>${sample.question}</p></div></div></div><div class="next-step"><p>문서에 있는 사실과, 아직 확인할 변화를 구분했어요.</p><button class="button primary" data-next="1">측정할 지표 골라보기 <span>→</span></button></div>`;
}
function metricView() {
  const metrics=state[currentOrg];
  return `<div class="metric-view"><div class="demo-title-row"><div><h3>기준을 확인하고, 필요한 지표만 남기세요.</h3><p>IRIS+ 참고 지표와 자체 지표를 구분했습니다. 정의와 적용 이유를 살펴본 뒤 확정해 보세요.</p></div><span class="metric-count">${metrics.filter(m=>m.selected).length}개 선택</span></div>${goalContext(currentOrg)}${metrics.map(m=>`<div class="metric-card ${m.selected?'':'excluded'}"><div class="metric-main"><label class="metric-check"><input type="checkbox" data-select="${m.id}" ${m.selected?'checked':''}><span><b>${m.title}</b><small>${m.method}</small><span class="metric-badge">${m.category}</span><span class="metric-badge ${metricStandards[m.id]?'iris-badge':''}">${standardLabel(m)}</span></span></label>${standardDetails(m)}</div><div class="target-input"><label for="target-${m.id}">기간 목표</label><div class="input-unit"><input id="target-${m.id}" aria-label="${m.title} 목표" data-target="${m.id}" type="number" min="${m.type==='count'?1:0.1}" max="${m.type==='rate'?100:1000000000}" step="${m.type==='count'?1:'any'}" value="${m.target}" ${m.selected?'':'disabled'}><span>${m.unit}</span></div></div><button class="review-button ${m.reviewed?'confirmed':''}" data-review="${m.id}" ${m.selected?'':'disabled'}>${m.reviewed?'✓ 검토 확정됨':'검토하고 확정'}</button></div>`).join('')}<p class="metric-footnote">IRIS+ 연결은 공식 정의를 참고해 준비한 가상 사례입니다. 자동 추천이나 기관 인증이 아니며, SVI·SPC 점수로 환산하지 않습니다.</p></div><div class="next-step"><p>선택한 기준·목표·검토 상태가 보고서에도 함께 반영됩니다.</p><button class="button primary" data-next="2">실적 기록하고 보고서 보기 <span>→</span></button></div>`;
}
function numericInput(metric,key,label,unit) {
  const isWhole=metric.type==='count'||(metric.type==='rate'&&!metric.rateUnit);
  return `<div class="input-unit"><input id="${key}-${metric.id}" data-value="${metric.id}" data-key="${key}" type="number" min="0" max="1000000000" step="${isWhole?1:'any'}" inputmode="decimal" class="${metric.type==='rate'?'rate':''}" value="${metric[key]??''}" placeholder="미입력" aria-label="${metric.title} ${label}"><span>${unit}</span></div>`;
}
function recordView() {
  const chosen=state[currentOrg].filter(m=>m.selected);
  return `<div class="record-view"><div class="demo-title-row"><div><h3>기록하면, 성과가 정리됩니다.</h3><p>2026년 예시 측정 기간 · 빈칸은 ‘미확인’으로 남습니다.</p></div><span class="metric-count">브라우저 안에서 계산</span></div>${chosen.length?`<div class="record-grid"><div class="record-fields">${chosen.map(m=>`<div class="record-field"><label for="${m.type==='rate'?'numerator':'actual'}-${m.id}">${m.title}</label>${m.type==='rate'?`<div class="input-unit">${numericInput(m,'numerator','확인된 인원 또는 양',m.rateUnit||'명')}<span>/</span>${numericInput(m,'denominator','전체 인원 또는 양',m.rateUnit||'명')}</div><small>분자: 확인된 인원·양 / 분모: 전체 대상 인원·양</small>`:numericInput(m,'actual','실적',m.unit)}<small>${m.method}</small><label class="evidence-label-input" for="evidence-${m.id}">자료 출처 메모</label><input class="evidence-input" id="evidence-${m.id}" data-evidence="${m.id}" maxlength="180" placeholder="어디서 확인한 값인가요?" value="${escapeHTML(m.evidence)}"><div class="input-error" id="error-${m.id}" role="status"></div></div>`).join('')}</div><aside class="record-result" id="record-result" aria-live="polite"></aside></div>`:'<div class="empty-state">선택한 지표가 없습니다. ‘지표와 검토’에서 기록할 항목을 선택하세요.</div>'}<div class="import-bar"><button data-action="template">이 조직의 CSV 양식 받기 ↓</button><label class="import-label" for="csv-import">기록 CSV 가져오기 ↑</label><input id="csv-import" type="file" accept=".csv,text/csv" hidden><p>체험용 CSV만 지원 · 파일은 이 기기에서 읽습니다.</p></div><div class="import-error" id="import-error" hidden role="alert"></div></div>`;
}
function resultOf(m) {
  const fields=m.type==='rate'?[m.numerator,m.denominator]:[m.actual];
  if(fields.some(v=>v===null||v===''))return {actual:null,error:''};
  if(fields.some(v=>!Number.isFinite(v)||v<0||v>1e9))return {actual:null,error:'0 이상 10억 이하의 숫자를 입력하세요.'};
  if((m.type==='count'||(m.type==='rate'&&!m.rateUnit))&&fields.some(v=>!Number.isInteger(v)))return {actual:null,error:'인원과 횟수는 정수로 입력하세요.'};
  if(m.type==='rate'&&m.denominator===0)return {actual:null,error:'전체 대상이 0이면 비율을 계산할 수 없습니다.'};
  if(m.type==='rate'&&m.numerator>m.denominator)return {actual:null,error:'확인된 인원·양은 전체 대상보다 클 수 없습니다.'};
  const actual=m.type==='rate'?m.numerator/m.denominator*100:m.actual;
  return {actual,error:'',achievement:actual/m.target*100};
}
function updateResults() {
  if(!$('#record-result'))return;
  let errors=0;
  const rows=state[currentOrg].filter(m=>m.selected).map(m=>{
    const result=resultOf(m);if(result.error)errors++;
    const errorNode=$(`#error-${m.id}`);if(errorNode)errorNode.textContent=result.error;
    $$(`[data-value="${m.id}"]`).forEach(el=>el.setAttribute('aria-invalid',String(Boolean(result.error))));
    return `<div class="result-row"><div class="result-head"><span>${m.title}</span><strong>${result.actual===null?'—':number(result.actual)}<small>${result.actual===null?'미확인':m.unit}</small></strong></div><div class="result-progress"><i style="width:${result.actual===null?0:Math.min(100,result.achievement)}%"></i></div><div class="result-meta"><span>목표 ${number(m.target)}${m.unit}</span><span>${result.actual===null?'추가 기록 필요':`달성률 ${number(result.achievement)}%`}</span></div><div class="result-meta"><span>${m.reviewed?'✓ 지표 검토 확정':'지표 검토 대기'}</span><span>${m.manual?'체험 입력 · 원문 대조 필요':m.evidence?'샘플 원문에 기록 있음':'출처 미입력'}</span></div></div>`;
  }).join('');
  $('#record-result').innerHTML=`<h4>지금까지의 성과 기록</h4>${rows}<p>달성률은 목표 대비 실적입니다. 사회적 가치의 크기나 공식 평가 점수를 뜻하지 않습니다.</p><button class="button primary" data-action="report" ${errors?'disabled':''}>성과 보고서 미리보기 <span>↗</span></button>${errors?'<p>입력한 수치를 확인하면 보고서를 볼 수 있습니다.</p>':''}`;
}
$('#demo-content').addEventListener('click',event=>{
  const next=event.target.closest('[data-next]');if(next){setStep(Number(next.dataset.next));$('#demo-content').focus({preventScroll:true});return;}
  const source=event.target.closest('[data-source]');if(source){$$('.source-paper p').forEach(p=>p.classList.remove('highlighted'));const paragraph=$(`#source-${source.dataset.source}`);paragraph.classList.add('highlighted');if(window.innerWidth<=680)paragraph.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});notify('강조된 원문에서 근거를 확인하세요.');return;}
  const review=event.target.closest('[data-review]');if(review){const m=state[currentOrg].find(m=>m.id===review.dataset.review);m.reviewed=!m.reviewed;persist();renderDemo();$(`[data-review="${m.id}"]`).focus({preventScroll:true});return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='report')openReport();
  if(action==='template')downloadCSV(true);
});
$('#demo-content').addEventListener('change',event=>{
  const input=event.target;
  if(input.matches('[data-select]')){const m=state[currentOrg].find(m=>m.id===input.dataset.select);m.selected=input.checked;persist();renderDemo();$(`[data-select="${m.id}"]`).focus({preventScroll:true});}
  if(input.matches('[data-target]')){const m=state[currentOrg].find(m=>m.id===input.dataset.target);if(!input.checkValidity()||input.value===''){input.value=m.target;notify('목표는 0보다 커야 하며, 비율 목표는 100% 이하여야 합니다.');return;}m.target=Number(input.value);m.reviewed=false;persist();renderDemo();$(`[data-target="${m.id}"]`).focus({preventScroll:true});}
  if(input.id==='csv-import'&&input.files?.[0])importCSV(input.files[0]);
});
$('#demo-content').addEventListener('input',event=>{
  const input=event.target;
  if(input.matches('[data-target]')){
    const m=state[currentOrg].find(m=>m.id===input.dataset.target);
    const valid=input.value!==''&&input.checkValidity();
    input.setAttribute('aria-invalid',String(!valid));
    const review=$(`[data-review="${m.id}"]`);
    if(review)review.disabled=!valid;
    if(valid){m.target=Number(input.value);m.reviewed=false;persist();if(review){review.classList.remove('confirmed');review.textContent='검토하고 확정';}}
  }
  if(input.matches('[data-value]')){const m=state[currentOrg].find(m=>m.id===input.dataset.value);m[input.dataset.key]=input.value===''?null:Number(input.value);m.manual=true;persist();updateResults();}
  if(input.matches('[data-evidence]')){const m=state[currentOrg].find(m=>m.id===input.dataset.evidence);m.evidence=input.value;m.manual=true;persist();updateResults();}
});
$('#reset-demo').addEventListener('click',()=>{state[currentOrg]=samples[currentOrg].metrics.map(freshMetric);persist();renderDemo();notify('이 조직의 체험을 처음 상태로 되돌렸습니다.');});

function reportHTML() {
  const sample=samples[currentOrg];const selected=state[currentOrg].filter(m=>m.selected);
  const reviewCount=selected.filter(m=>m.reviewed).length;
  return `<article class="report-body"><p class="report-kicker">VALUE LENS / SOCIAL VALUE RECORD</p><h2>${sample.name}<br>우리 조직의 변화 기록</h2><p class="report-meta">2026년 예시 측정 기간 · 가상 데이터 · 지표 검토 ${reviewCount}/${selected.length}개 완료</p><div class="report-table-wrap"><table class="report-table"><thead><tr><th>지표</th><th>목표</th><th>실적</th><th>달성률</th><th>검토</th></tr></thead><tbody>${selected.map(m=>{const r=resultOf(m);return `<tr><td>${m.title}<small>${standardLabel(m)}</small></td><td>${number(m.target)}${m.unit}</td><td>${r.actual===null?'미확인':number(r.actual)+m.unit}${m.type==='rate'&&r.actual!==null?`<small>${number(m.numerator)} / ${number(m.denominator)}${m.rateUnit||'명'}</small>`:''}</td><td>${r.actual===null?'—':number(r.achievement)+'%'}</td><td>${m.reviewed?'확정':'대기'}</td></tr>`;}).join('')}</tbody></table></div><div class="report-notes"><h3>연결한 측정 기준</h3><p>SDG ${orgGoals[currentOrg].number} · ${orgGoals[currentOrg].title} — 목표 수준의 연결 예시입니다. UN 공식 세부지표 측정 결과가 아닙니다.</p><ul>${selected.filter(m=>metricStandards[m.id]).map(m=>{const s=metricStandards[m.id];return `<li><b>${s.code} · ${s.name}</b> (참고 카탈로그 ${s.catalog})<br>${s.definition}<br>적용: ${s.application}<br><a href="${s.url}" target="_blank" rel="noopener noreferrer">GIIN 공식 정의 ↗</a></li>`;}).join('')}</ul><p>IRIS+ 코드가 없는 항목은 조직 자체 지표입니다. 표준 연결은 담당자가 검토할 참고 사항이며, 기관 인증을 의미하지 않습니다.</p><h3>숫자와 함께 남긴 근거</h3><ol>${selected.map(m=>`<li><b>${m.title}</b><br>${escapeHTML(m.evidence)||'자료 출처가 아직 입력되지 않았습니다.'}<br>집계: ${m.method}<br>${m.manual?'체험 중 입력·수정한 값입니다. 원문과 대조가 필요합니다.':'미리 준비된 가상 샘플 기록입니다.'}</li>`).join('')}</ol><h3>추가로 확인할 변화</h3><p>${sample.question}</p></div><p class="report-disclaimer">이 보고서는 가상 데이터로 만든 체험 결과입니다. 입력한 값의 사실 여부를 검증하지 않으며, SVI·SPC 등 공식 평가·인증이나 외부 검증을 포함하지 않습니다. 지표 검토 확정은 측정 항목에 대한 사용자의 선택이며, 실적 데이터의 검증을 뜻하지 않습니다.</p></article>`;
}
function openReport(){ $('#report-content').innerHTML=reportHTML();$('#report-dialog').showModal(); }
$('#close-report').addEventListener('click',()=>$('#report-dialog').close());
$('#report-dialog').addEventListener('click',event=>{if(event.target===$('#report-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
function saveFile(text,filename,type){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#download-report').addEventListener('click',()=>{
  const css='body{font-family:system-ui,"Malgun Gothic",sans-serif;color:#263c30;max-width:900px;margin:45px auto;padding:0 24px;line-height:1.8;word-break:keep-all}h2{font-size:28px;line-height:1.5}table{width:100%;border-collapse:collapse;margin:28px 0;font-size:16px}td,th{text-align:left;padding:12px;border-bottom:1px solid #d9ddce}th{background:#eeefe5}small{display:block;font-size:14px;color:#656c60}.report-kicker,.report-meta,.report-disclaimer{font-size:15px;color:#656c60}.report-notes{font-size:16px}li{margin-bottom:15px}.report-disclaimer{border-top:1px solid #d9ddce;padding-top:20px}.report-table-wrap{overflow:auto}@media print{body{margin:0;padding:15px}table{font-size:14px}}';
  saveFile(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${samples[currentOrg].name} 성과 기록</title><style>${css}</style></head><body>${reportHTML()}</body></html>`,`${samples[currentOrg].name}_성과기록.html`,'text/html;charset=utf-8');notify('보고서 파일을 내려받았습니다. 브라우저에서 열어 인쇄하거나 PDF로 저장할 수 있습니다.');
});
function csvCell(value){let str=String(value??'');if(/^[=+@\-\t\r]/.test(str))str="'"+str;return `"${str.replaceAll('"','""')}"`;}
function downloadCSV(template=false){const rows=[['metric_id','target','actual','numerator','denominator','evidence'],...state[currentOrg].filter(m=>template||m.selected).map(m=>[m.id,m.target,m.actual??'',m.numerator??'',m.denominator??'',m.evidence])];saveFile('\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),`${currentOrg}_${template?'기록양식':'성과기록'}.csv`,'text/csv;charset=utf-8');notify('현재 조직의 기록 CSV를 내려받았습니다.');}
$('#download-csv').addEventListener('click',()=>downloadCSV());
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=char;}
  if(quoted)throw new Error('CSV의 따옴표가 닫히지 않았습니다. 양식을 확인하세요.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
async function importCSV(file){
  try {
    if(!/\.csv$/i.test(file.name))throw new Error('CSV 파일을 선택하세요.');
    if(file.size>1024*1024)throw new Error('1MB 이하의 체험용 CSV만 가져올 수 있습니다.');
    const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));
    const expected=['metric_id','target','actual','numerator','denominator','evidence'];
    if(rows.length<2||rows[0].join(',')!==expected.join(','))throw new Error('이 조직의 CSV 양식을 먼저 내려받아 사용하세요. 열 이름과 순서를 유지해야 합니다.');
    const next=state[currentOrg].map(m=>({...m}));const seen=new Set();
    for(const row of rows.slice(1)){
      if(row.length!==6)throw new Error('CSV의 각 행에는 6개의 열이 필요합니다.');
      const m=next.find(item=>item.id===row[0]);if(!m)throw new Error('다른 조직의 지표가 포함되어 있습니다. 현재 선택한 조직의 양식을 사용하세요.');
      if(seen.has(m.id))throw new Error('같은 지표가 두 번 들어 있습니다. 중복 행을 제거하세요.');seen.add(m.id);
      for(const [key,index]of [['target',1],['actual',2],['numerator',3],['denominator',4]]){const raw=row[index].trim();const value=raw===''?null:Number(raw);if(value!==null&&(!Number.isFinite(value)||value<0||value>1e9))throw new Error('숫자 칸에는 0 이상 10억 이하의 숫자만 입력하세요.');m[key]=value;}
      if(m.target===null||m.target<=0||(m.type==='rate'&&m.target>100)||(m.type==='count'&&!Number.isInteger(m.target)))throw new Error('목표는 양수여야 합니다. 비율 목표는 100% 이하, 인원·횟수 목표는 정수로 입력하세요.');
      const result=resultOf(m);if(result.error)throw new Error(`${m.title}: ${result.error}`);
      if(row[5].length>180)throw new Error('자료 출처 메모는 180자 이내로 입력하세요.');
      m.evidence=row[5];m.reviewed=false;m.manual=true;m.selected=true;
    }
    state[currentOrg]=next;persist();renderDemo();notify(`${seen.size}개 지표의 기록을 가져왔습니다. 지표를 다시 검토해 주세요.`);
  }catch(error){const box=$('#import-error');if(box){box.hidden=false;box.textContent=error.message;}notify('CSV 내용을 확인해 주세요. 기존 기록은 그대로 보관했습니다.');}
  finally{const input=$('#csv-import');if(input)input.value='';}
}
renderDemo();
if(!storageAvailable)$('#save-state').textContent='브라우저 저장이 제한되어 있습니다. 보고서를 내려받아 보관하세요.';
