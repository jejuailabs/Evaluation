import type { Workspace } from './types';
export function createSeed(): Workspace {
  const orgId = 'org-demo';
  const at = '2026-09-30T08:00:00.000Z';
  return {
    schemaVersion: 1, revision: 0, organization: { id: orgId, name: '느티나무 사회적협동조합' },
    members: [{ id: 'm1', name: '김하늘', role: '프로젝트 책임' }, { id: 'm2', name: '이수진', role: '현장 운영' }, { id: 'm3', name: '박지훈', role: '회계·지원' }],
    projects: [
      { id: 'care', orgId, name: '동네 돌봄 연결', purpose: '혼자 지내는 이웃에게 정기적인 방문과 생활 지원을 연결합니다.', start: '2026-07-01', end: '2026-12-31', ownerId: 'm1', budget: 48000000, category: '돌봄' },
      { id: 'reuse', orgId, name: '다시 쓰는 물건, 이어지는 일', purpose: '지역에서 모은 물건을 수선하고 판매하며 일할 기회를 만듭니다.', start: '2026-08-01', end: '2026-11-30', ownerId: 'm2', budget: 32000000, category: '자원순환' },
    ],
    tasks: [
      { id: 't1', orgId, projectId: 'care', title: '10월 방문 일정 나누기', due: '2026-10-06', ownerId: 'm1', status: 'doing' },
      { id: 't2', orgId, projectId: 'care', title: '9월 이용자 기록 확인', due: '2026-10-07', ownerId: 'm2', status: 'todo' },
      { id: 't3', orgId, projectId: 'care', title: '방문 활동가 교육', due: '2026-09-24', ownerId: 'm1', status: 'done' },
      { id: 't4', orgId, projectId: 'care', title: '10월 교통비 증빙 모으기', due: '2026-10-23', ownerId: 'm3', status: 'todo' },
      { id: 't5', orgId, projectId: 'reuse', title: '수선 워크숍 참여자 모집', due: '2026-10-08', ownerId: 'm2', status: 'doing' },
      { id: 't6', orgId, projectId: 'reuse', title: '9월 수선 물품 집계', due: '2026-09-30', ownerId: 'm2', status: 'done' },
    ],
    documents: [
      { id: 'd-plan', orgId, projectId: 'care', title: '동네 돌봄 사업계획 · 예시', versions: [{ id: 'v-plan', name: '동네_돌봄_사업계획_예시.txt', size: 900, createdAt: at, inlineText: '가상의 사업계획 예시입니다.\n목적: 혼자 지내는 이웃에게 정기적인 방문과 생활 지원을 연결합니다.\n목표: 사업 기간 내 돌봄을 받은 고유 이용자 120명. 명부의 참여자 번호로 중복을 제외합니다.\n활동 목표: 정기 방문과 생활 지원 총 900회. 방문 날짜와 기록 번호로 집계합니다.\n9월 점검 이후 예상: 확인된 이용자 86명에 남은 기간 신규 이용자 42명을 더해 128명. 중복 없이 모집한다는 가정입니다.\n매월 담당자가 명부와 방문 기록을 대조하고, 분기 말에 목표 대비 결과를 확인합니다.\n종료 보고에는 목표·예상·확인 실적, 집행 내역, 현장 변화와 원본 자료를 함께 정리합니다.' }] },
      { id: 'd1', orgId, projectId: 'care', title: '9월 돌봄 활동 집계', versions: [{ id: 'v1', name: '9월_돌봄_활동_집계_예시.txt', size: 170, createdAt: at, inlineText: '가상의 시제품 자료입니다.\n2026-07-01~2026-09-30 누적: 중복을 제거한 이용자 86명, 방문 412회.\n실제 참여자 데이터나 외부 기관이 검증한 실적이 아닙니다.' }] },
      { id: 'd2', orgId, projectId: 'care', title: '사업비 집행 근거', versions: [{ id: 'v2', name: '사업비_집행_예시.txt', size: 130, createdAt: at, inlineText: '가상 집행 예시. 활동가 인건비 1,680만원, 운영비 480만원, 교통비 집행 예정 240만원. 실제 영수증이 아닙니다.' }] },
      { id: 'd3', orgId, projectId: 'reuse', title: '9월 수선 작업 기록', versions: [{ id: 'v3', name: '수선_작업_기록_예시.txt', size: 100, createdAt: at, inlineText: '가상 샘플. 사업 시작 이후 9월 말까지 수선 완료 248개, 작업 운영비 960만원.' }] },
    ],
    expenses: [
      { id: 'e1', orgId, projectId: 'care', title: '활동가 인건비', amount: 16800000, date: '2026-09-30', ownerId: 'm1', status: 'paid', evidence: { documentId: 'd2', versionId: 'v2' } },
      { id: 'e2', orgId, projectId: 'care', title: '방문 운영비', amount: 4800000, date: '2026-09-30', ownerId: 'm2', status: 'confirmed', evidence: { documentId: 'd2', versionId: 'v2' } },
      { id: 'e3', orgId, projectId: 'care', title: '10월 이동 지원비', amount: 2400000, date: '2026-10-05', ownerId: 'm3', status: 'planned', evidence: { documentId: 'd2', versionId: 'v2' } },
      { id: 'e4', orgId, projectId: 'reuse', title: '수선 작업 운영비', amount: 9600000, date: '2026-09-30', ownerId: 'm2', status: 'paid', evidence: { documentId: 'd3', versionId: 'v3' } },
    ],
    indicators: [
      { id: 'i1', orgId, projectId: 'care', name: '돌봄을 받은 이웃', unit: '명', target: 120, forecast: 128, forecastNote: '가상 예시: 현재 이용자 86명 + 남은 기간 신규 이용자 42명 예상. 실적이 아닙니다.', definition: '사업 시작일부터 기준일까지 돌봄을 받은 사람을 중복 없이 셉니다. 방문 횟수와 구분합니다.', source: 'IRIS+ PI4060 참고', sourceUrl: 'https://iris.thegiin.org/metric/5.3/pi4060/', aggregation: 'cumulative-snapshot', direction: 'higher', version: 1 },
      { id: 'i2', orgId, projectId: 'care', name: '이어진 돌봄 방문', unit: '회', target: 900, forecast: 840, forecastNote: '가상 예시: 월평균 140회 × 6개월. 담당자가 입력한 가정입니다.', definition: '사업 시작일부터 기준일까지 완료한 방문의 누적 횟수. 취소된 방문은 제외합니다.', source: '우리 조직 지표', aggregation: 'cumulative-snapshot', direction: 'higher', version: 1 },
      { id: 'i3', orgId, projectId: 'reuse', name: '다시 쓰게 된 물건', unit: '개', target: 600, forecast: 620, forecastNote: '가상 예시: 남은 작업 일정과 수선 가능 물량에 따른 예상.', definition: '사업 시작일부터 기준일까지 수선을 완료한 물품 수. 재작업은 같은 물품으로 셉니다.', source: '우리 조직 지표', aggregation: 'cumulative-snapshot', direction: 'higher', version: 1 },
    ],
    measurements: [
      { id: 'r0', orgId, projectId: 'care', indicatorId: 'i1', asOf: '2026-08-31', value: 60, note: '8월 말 누적 확인값. 가상 기록.', evidence: { documentId: 'd1', versionId: 'v1' }, status: 'confirmed', createdAt: at, confirmedAt: at },
      { id: 'r1', orgId, projectId: 'care', indicatorId: 'i1', asOf: '2026-09-30', value: 86, note: '가상 명부에서 중복을 제거한 인원.', evidence: { documentId: 'd1', versionId: 'v1' }, status: 'confirmed', createdAt: at, confirmedAt: at },
      { id: 'r2', orgId, projectId: 'care', indicatorId: 'i2', asOf: '2026-09-30', value: 412, note: '취소 방문을 제외한 누적 방문 횟수.', evidence: { documentId: 'd1', versionId: 'v1' }, status: 'confirmed', createdAt: at, confirmedAt: at },
      { id: 'r3', orgId, projectId: 'reuse', indicatorId: 'i3', asOf: '2026-09-30', value: 248, note: '작업 기록의 수선 완료 물품.', evidence: { documentId: 'd3', versionId: 'v3' }, status: 'confirmed', createdAt: at, confirmedAt: at },
      { id: 'r4', orgId, projectId: 'care', indicatorId: 'i1', asOf: '2026-10-05', value: 91, note: '10월 5일까지 추가 기록. 예시 자료와 대조 후 확인해 주세요.', evidence: { documentId: 'd1', versionId: 'v1' }, status: 'pending', createdAt: '2026-10-05T01:00:00.000Z' },
    ],
    annualPlans:[{id:'year-2026',orgId,year:2026,title:'함께 돌보고, 다시 쓰는 2026',purpose:'돌봄이 필요한 이웃에게 손을 내밀고, 지역의 자원이 다시 쓰이도록 합니다. 두 사업의 실행과 변화를 함께 살펴봅니다.',budget:90000000,status:'active',version:1,changes:[]}],
    annualGoals:[{id:'goal-care',orgId,planId:'year-2026',name:'120명의 이웃에게 돌봄을 연결해요',unit:'명',target:120,definition:'동네 돌봄 연결 사업의 중복 제거 이용자 수를 기준으로 확인합니다.',direction:'higher',aggregation:'sum',linkIds:['i1'],deduplication:'하나의 사업에서 중복을 제거한 명부로 집계하는 예시입니다.',version:1,changes:[]},{id:'goal-reuse',orgId,planId:'year-2026',name:'600개의 물건을 다시 사용해요',unit:'개',target:600,definition:'수선 완료 기록의 고유 물품 수. 재작업은 제외합니다.',direction:'higher',aggregation:'sum',linkIds:['i3'],deduplication:'단일 프로젝트의 고유 물품 번호 기준입니다.',version:1,changes:[]}],annualReports:[],activities:[],
    reports: [], events: [{ id: 'a1', projectId: 'care', action: '9월 성과와 집행 기록을 모았어요', at }],
  };
}
