'use strict';

// Curated references for the sample, not automatic matching or certification.
const metricStandards = {
  care_people: {
    code: 'PI4060', name: 'Client Individuals: Total', catalog: 'v5.3',
    url: 'https://iris.thegiin.org/metric/5.3/pi4060/',
    definition: '보고 기간에 조직의 제품·서비스를 이용한 개인을 중복 없이 집계합니다.',
    application: '돌봄 서비스를 이용한 어르신을 기간 내 중복 없이 집계합니다. 방문 횟수로 대체하거나 가족 수를 곱하지 않습니다.',
    evidence: '대상자 명부, 이용 기간, 중복 제거 기준과 집계 출처'
  },
  care_staff: {
    code: 'OI5323', name: 'Caregivers Employed: Total', catalog: 'v5.2',
    url: 'https://iris.thegiin.org/metric/5.2/oi5323/',
    definition: '기간 말에 고용 중이며 현지 면허·자격·교육 요건을 충족한 돌봄 인력 수를 집계합니다.',
    application: '기간 말 재직과 자격·교육 요건을 확인한 인원을 기록합니다. 실제 적용 시 국내 해당 직무의 요건을 확인해야 합니다.',
    evidence: '기간 말 재직 명부, 면허·자격 또는 교육 이수 자료'
  }
};
const orgGoals = {
  care: { number:'3', title:'건강과 웰빙', reason:'안부 확인과 관계 형성으로 고립을 줄이려는 돌봄 활동', url:'https://sdgs.un.org/goals/goal3' },
  jobs: { number:'8', title:'양질의 일자리와 경제성장', reason:'채용 이후에도 이어지는 고용과 생활의 안정', url:'https://sdgs.un.org/goals/goal8' },
  reuse: { number:'12', title:'책임 있는 소비와 생산', reason:'수거·수선한 물품의 재사용과 자원 낭비 감소', url:'https://sdgs.un.org/goals/goal12' }
};

function standardLabel(metric) {
  const reference = metricStandards[metric.id];
  return reference ? `IRIS+ 참고 · ${reference.code}` : '조직 자체 지표 · IRIS+ 코드 미부여';
}
function standardDetails(metric) {
  const reference = metricStandards[metric.id];
  if (!reference) return `<details class="metric-reference"><summary>자체 지표로 구분한 이유 <span>+</span></summary><p>이 체험에서 일치하는 IRIS+ 정의를 확인하지 않아, 조직의 측정 목적과 집계 방법을 정한 자체 지표로 사용합니다. 공식 코드와 임의로 연결하지 않습니다.</p></details>`;
  return `<details class="metric-reference"><summary>기준 정의·적용 이유·필요 증빙 <span>+</span></summary><p class="reference-name">${reference.name} · ${reference.code}</p><dl><div><dt>정의 요약</dt><dd>${reference.definition}</dd></div><div><dt>적용 예시</dt><dd>${reference.application}</dd></div><div><dt>필요 증빙</dt><dd>${reference.evidence}</dd></div></dl><a href="${reference.url}" target="_blank" rel="noopener noreferrer">GIIN 원문 · 참고 카탈로그 ${reference.catalog} ↗</a><p class="reference-limit">공식 정의를 참고한 샘플 연결입니다. 담당자 검토는 기관의 인증·검증을 의미하지 않습니다.</p></details>`;
}
function goalContext(org) {
  const goal = orgGoals[org];
  return `<div class="goal-context"><span class="goal-number">SDG <b>${goal.number}</b></span><div><strong>${goal.title}</strong><p>${goal.reason}</p><small>목표 수준의 연결 예시 · UN 공식 세부지표 측정값 아님</small></div><a href="${goal.url}" target="_blank" rel="noopener noreferrer">목표 원문 ↗</a></div>`;
}
