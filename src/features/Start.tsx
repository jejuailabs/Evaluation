import type { Workspace } from '../domain/types';
import { Field, Form, Icon, Pill, textValue } from '../ui/shared';

export function Start({ workspace, create }: { workspace: Workspace | null; create: (organization: string, member: string) => void }) {
  return <div className="start-shell">
    <header className="start-header"><a className="brand" href="https://value-lens-studio.naggu1999.chatgpt.site/"><span className="brand-symbol">✳</span><span>가치 돋보기<small>VALUE LENS</small></span></a><a className="text-link" href="?mode=demo#/home">데모 보기 <Icon name="arrow" size={17}/></a></header>
    <main className="start-main">
      <div className="start-copy"><p className="eyebrow">우리 조직으로 시작하기</p><h1>첫 프로젝트부터,<br/>우리의 기록으로.</h1><p className="start-lede">조직 이름을 정하고, 시작할 일을 하나 만들어 보세요. 업무와 자료를 모으는 동안 성과도 함께 쌓여요.</p>
        <ol className="start-steps"><li><span>01</span><div><strong>우리 조직을 준비해요</strong><p>조직 이름과 내 이름만 입력해요.</p></div></li><li><span>02</span><div><strong>첫 프로젝트를 만들어요</strong><p>할 일, 기간, 예산부터 정해요.</p></div></li><li><span>03</span><div><strong>진행하며 기록을 모아요</strong><p>업무·자료·예산·성과를 한곳에서 봐요.</p></div></li></ol>
        <a className="text-link" href="?mode=demo#/home">먼저 예시 프로젝트 둘러보기 <Icon name="arrow" size={17}/></a>
      </div>
      <section className="start-card" aria-labelledby="start-title"><Pill>시작 화면 미리보기</Pill><h2 id="start-title">{workspace?'만들어 둔 작업실이 있어요.':'우리 조직의 자리를 만들어요.'}</h2>
        <p className="start-auth-note">정식 서비스에서는 로그인 후 시작해요. 지금은 로그인·공동 저장을 준비 중이며, 이 브라우저에만 저장되는 시작 과정을 확인할 수 있어요.</p>
        {workspace?<><div className="resume-workspace"><span className="avatar">{workspace.organization.name.slice(0,1)}</span><div><strong>{workspace.organization.name}</strong><p>프로젝트 {workspace.projects.length}개 · 이 브라우저에 저장됨</p></div></div><a className="button primary full" href="#/home">내 작업실 이어서 보기 <Icon name="arrow"/></a></>:<Form label="빈 작업실 만들기" submit={f=>create(textValue(f,'organization'),textValue(f,'member'))}><Field label="조직 이름"><input name="organization" placeholder="예: 함께걷는 사회적협동조합" required maxLength={80} autoComplete="organization"/></Field><Field label="내 이름"><input name="member" placeholder="작업실에서 사용할 이름" required maxLength={40} autoComplete="name"/></Field><p className="form-hint">예시 프로젝트나 실적은 넣지 않아요.<br/>이름을 입력해도 회원 가입은 되지 않아요.</p></Form>}
      </section>
    </main><footer className="start-footer">VALUE LENS · 계획부터 기록, 보고까지 함께</footer>
  </div>;
}

export function FirstProject({ create, title = '첫 프로젝트를 만들어 볼까요?' }: { create: () => void; title?: string }) {
  return <section className="first-project"><div className="first-project-copy"><p className="eyebrow">아직 프로젝트가 없어요</p><h2>{title}</h2><p>완성된 사업계획서가 없어도 괜찮아요.<br/>프로젝트 이름과 기간부터 정하고, 하나씩 채워 가세요.</p><button className="button primary" onClick={create}><Icon name="plus"/>첫 프로젝트 만들기</button></div><div className="first-project-flow"><div><span>01</span><strong>계획</strong><p>목적 · 기간 · 예산</p></div><div><span>02</span><strong>진행</strong><p>업무 · 일정 · 현장 자료</p></div><div><span>03</span><strong>결과</strong><p>목표와 실적 · 보고서</p></div></div></section>;
}
