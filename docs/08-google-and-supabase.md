> 현재 상태(2026-10-06): 사용자 승인으로 Supabase `projecthub` 내부에 `value_lens` 스키마·전용 DB 계정·비공개 버킷을 생성했고 실제 DB 연결을 검증했습니다. 이메일 제공자는 활성, Google은 비활성입니다. 아래는 이전 Sites/D1/R2 단계의 기록입니다. 현재 설정과 남은 연결 작업은 [12 배포 안내](12-vercel-deployment.md)가 기준입니다.

# 08. Google 로그인 · Supabase 연결

2026-10-05. 사용자 지시: ChatGPT 계정을 서비스의 기본 로그인으로 삼지 않고 최소 Google 로그인을 제공한다. Supabase MCP를 확인한다.

## 현재 상태

- Supabase MCP 연결 확인. 조직 `vibe`(무료), 활성 프로젝트 `projecthub`, 비활성 `novel` 및 `funjeju's Project`.
- 연결할 프로젝트는 사용자 선택 대기 중이다. 새 프로젝트 생성, 기존 프로젝트 수정, DB 이전은 아직 실행하지 않았다.
- **Google 로그인 서버·화면 연결 코드는 준비했지만 공개 서비스의 Google 로그인은 아직 활성화하지 않았다.** Google OAuth 설정과 Supabase 프로젝트 연결 없이는 실제 로그인할 수 없다.
- 업무 DB는 여전히 D1, 원본은 R2다. Supabase Auth만 연결한다고 PostgreSQL·Storage로 이전되는 것이 아니다.
- 이전 ChatGPT 계정과 Supabase 계정을 이메일만으로 자동 합치지 않는다. 기존 데이터가 있으면 실제 소유자 확인과 ID 매핑이 필요하다.

## 구현한 인증 경로

1. `/auth/google` → Supabase Auth의 Google OAuth 시작. 공식 `@supabase/ssr` PKCE 사용.
2. Google → 선택한 Supabase 프로젝트의 `/auth/v1/callback`.
3. Supabase → 서비스 `/auth/callback`. 브라우저에 묶인 PKCE 코드 검증 후 세션 교환.
4. 서버 `getUser()`로 사용자 검증. 확인된 이메일과 `supabase:<user.id>`를 기존 조직 권한 API에 전달.
5. 조직 초대 경로와 선택 조직 복귀. 복귀 주소는 이 서비스의 루트 작업실 경로만 허용.
6. `/auth/logout`은 같은 출처의 POST만 허용. 브라우저 세션 쿠키를 지우고 Supabase의 해당 세션에서 로그아웃.

로그인·갱신 쿠키는 HttpOnly/Secure/SameSite=Lax이며, 응답은 캐시 금지다. 클라이언트 저장소의 사용자 정보나 수정 가능한 `user_metadata`로 조직 권한을 결정하지 않는다. 익명/이메일 미확인 계정은 거부한다. SDK 버전은 고정하고 lockfile에 기록한다.

기존 Sites 인증 파일과 경로는 이행·복귀용으로 남긴다. `AUTH_PROVIDER=supabase`를 설정하면 작업실 인증과 화면은 Google 경로만 사용하고 Sites 사용자 헤더는 인증에 사용하지 않는다. 제공자 전환 전에는 현행 공개 로그인을 유지한다.

## 연결할 때 필요한 설정

### Supabase

- Google provider를 켜고 Google Cloud의 Web application OAuth Client ID와 Client Secret 등록.
- Google OAuth의 승인된 리디렉션 URI: 선택한 Supabase 프로젝트 대시보드에 표시되는 callback URL을 그대로 등록.
- 서비스 복귀 허용 URL: `https://value-lens-workspace.naggu1999.chatgpt.site/auth/callback`.
- Site URL: `https://value-lens-workspace.naggu1999.chatgpt.site`.
- 로그인 범위는 기본 프로필·이메일만 사용한다. Google Drive/Calendar 권한은 별도 제품 연동 때 요청한다.
- 기존 `projecthub`를 선택하는 경우 기존 Site URL과 허용 URL·다른 앱 설정을 보존하며 추가한다.

### 호스팅 서버 환경 변수

| 이름 | 값 / 성격 |
| --- | --- |
| `AUTH_PROVIDER` | `supabase` — 실제 전환 시에만 설정 |
| `SUPABASE_URL` | 선택 프로젝트의 HTTPS API 주소 |
| `SUPABASE_PUBLISHABLE_KEY` | 해당 프로젝트의 `sb_publishable_…` 키. 서비스 역할 키는 이 항목에 넣지 않는다 |
| `APP_URL` | `https://value-lens-workspace.naggu1999.chatgpt.site` |
| `PLATFORM_ADMIN_USER_IDS` | 소유 확인을 마친 `supabase:<user.id>`. 첫 가입자에게 자동 부여하지 않는다 |

Google Client Secret은 **Supabase의 Google provider 비밀 설정**에 넣는다. 채팅·소스·브라우저 코드·호스팅 매니페스트에 기록하지 않는다. 배포 대상 환경 변수는 Sites 네이티브 도구로 적용한다.

## DB 이전을 선택하는 경우

별도 작업으로 PostgreSQL 조직·멤버십·프로젝트·업무·자료/버전·예산·지표·실적·보고서 테이블, RLS, 트랜잭션 명령/RPC, 비공개 Storage, 사용자 ID 매핑과 데이터 대조·백업/복구를 준비한다. D1 전체 JSON을 클라이언트 권한만으로 Supabase에 쓰는 임시 이전은 하지 않는다. 인증, 업무 데이터, 파일을 어떤 단계에서 전환했는지 각각 기록한다.

## 검증과 남은 인수

공식 SDK를 사용한 모의 Auth 서버 테스트 6개와 기존 도메인/API 테스트 26개가 통과했다. PKCE challenge/verifier 일치, 초대 복귀, 서버 사용자 검증, 미확인 이메일 차단, 취소/실패, 안전한 복귀 주소, 로그아웃 CSRF, 쿠키·캐시 정책을 확인했다.

실제 Google 계정 로그인, 브라우저 재방문·만료 갱신, 두 계정 초대·권한 회수, 실제 업로드·다운로드, 운영 callback 허용 URL 검증은 설정 이후 필수다. 모의 테스트 통과를 실제 Google 로그인 성공으로 표시하지 않는다.

근거: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google), [서버 쿠키 인증](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). 최신 Supabase 변경 내역을 확인했고, 이번 구현은 안정된 쿠키 기반 `@supabase/ssr` 경로를 사용한다.
