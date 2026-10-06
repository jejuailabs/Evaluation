# Vercel 배포 — Vinext 유지

기준: 2026-10-06. 이 저장소의 기본 실행 환경을 Vinext + Nitro + Vercel Node.js로 전환했습니다. 화면·연간 계획·프로젝트·권한·예산·성과·보고서 도메인은 유지합니다. 일반 Next.js 전환은 하지 않았습니다.

## Vercel 프로젝트 만들기

| 항목 | 설정 |
| --- | --- |
| Git 저장소 | `jejuailabs/Evaluation` |
| Production Branch | `main` |
| Root Directory | `./` (저장소 루트) |
| Framework Preset | **Other** |
| Node.js | **22.x** |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `.vercel/output` |

`vercel.json`이 위 빌드 설정을 지정합니다. `next`가 의존성에 있어도 Next.js 프리셋으로 덮어쓰지 않습니다. Nitro가 Vercel Build Output API v3의 정적 파일·라우팅·서버 함수를 생성합니다. 함수는 60초 제한이고 AI 요청 타임아웃은 45초입니다. 빌드 시 서비스 키가 없어도 성공하고 데모를 열 수 있습니다. 조직 로그인·실제 저장에는 아래 설정이 필요합니다.

## 환경변수

`.env.example`을 기준으로 Vercel의 Production/Preview 범위에 따로 등록합니다. `.env.local`은 Git에 올리지 않습니다. 서버 키에 `VITE_`나 `NEXT_PUBLIC_`를 붙이지 않습니다.

Vercel 등록용 `.env.vercel.local`을 준비했고 서버 키까지 반영했습니다(Git 제외, 비밀값 포함). 운영 `APP_URL`은 `https://evaluation-jejuai.vercel.app`입니다. 이 파일의 값을 Vercel 프로젝트의 환경변수에 등록하고 재배포해야 합니다. 로컬 파일 갱신만으로 배포 서버의 설정이 바뀌지는 않습니다. 관리 토큰과 마이그레이션 관리자 접속값은 이 파일에서 제외합니다.

| 이름 | 값/용도 |
| --- | --- |
| `DATABASE_URL` | `value_lens_runtime.<project-ref>` 전용 계정의 Transaction pooler 연결 문자열(6543). `.env.local`에 실제 접속 검증 후 저장. 서버 풀 최대 2개, TLS 인증서 검증, 이름 있는 prepared statement 없이 사용 |
| `SUPABASE_URL` | 같은 프로젝트의 HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` 키. Google 사용자 세션 검증 |
| `SUPABASE_SECRET_KEY` | 서버 전용 `sb_secret_…` 키. 비공개 Storage 서명 URL 발급 |
| `SUPABASE_STORAGE_BUCKET` | 기본값 `value-lens-documents` |
| `APP_URL` | 서비스의 정확한 origin, 예: `https://evaluation.example`. 경로 없이 지정 |
| `OPENAI_API_KEY` | 기존 OpenAI API 키 |
| `OPENAI_MODEL` | 로컬 실제 호출 검증 모델: `gpt-6-luna` |
| `PLATFORM_ADMIN_USER_IDS` | 전체 관리자에 한해 `supabase:<Auth 사용자 UUID>`. 여러 명은 쉼표 구분 |

`AUTH_PROVIDER`는 더 이상 선택값이 아닙니다. Vercel 서버는 Supabase로 인증하고 ChatGPT 헤더를 인증 정보로 사용하지 않습니다. `APP_URL`이 없으면 Vercel의 `VERCEL_URL`을 사용하지만 Google OAuth redirect를 정확히 등록하기 위해 고정 주소를 권장합니다. Preview는 별도 환경과 callback 주소로 설정합니다. 운영 DB를 모든 PR 미리보기에 연결하지 않습니다.

## DB와 파일 저장소 준비

2026-10-06 사용자 승인으로 기존 `projecthub` (`tcodixafsipheefvuouc`, 서울 리전)를 공유합니다. 새 독립 프로젝트 생성은 무료 활성 프로젝트 한도로 거절됐고, 기존 프로젝트 안에 별도 업무 공간을 생성하는 방식으로 전환했습니다. 기존 서비스의 업무 테이블·버킷과 Auth의 Site URL·메일 템플릿은 보존했고, 가치 돋보기의 로그인 복귀 주소만 허용 목록에 추가했습니다.

- `value_lens` 비공개 스키마: 업무 테이블 9개와 마이그레이션 이력. 모든 테이블에 RLS 적용, `anon`/`authenticated` 직접 접근 없음.
- `value_lens_runtime`: 이 서비스 전용 로그인 역할. 상위 역할을 상속하지 않으며 `value_lens_app`만 사용할 수 있습니다. 기존 `public` 업무 테이블과 `auth.users` 조회 불가를 실제 확인했습니다. 비밀번호는 Git에서 제외된 로컬 설정에만 저장합니다.
- `value-lens-documents`: 비공개, 파일당 25MiB, 형식 제한 없음. 기존 `project-materials` 버킷과 정책을 유지했습니다. 서버 Secret Key를 로컬 환경에 연결하고 앱의 Storage 어댑터로 서명 업로드 → 크기 조회 → 서명 다운로드 및 내용 일치 → 익명·공개 URL 접근 차단 → 검증 파일 삭제를 확인했습니다. 로그인한 두 조직 간의 전체 API 흐름 검증은 별도입니다.
- 실제 Transaction pooler 연결, 전용 테이블 저장·조회·JOIN, 기존 서비스 테이블 접근 거부, 검증 데이터 롤백을 확인했습니다. 로컬 `.env.local`에 URL·공개 키·전용 DB 접속값을 저장했습니다.
- Auth 관리 API 확인 결과: Email 활성, 이메일 확인 필수, 가입 허용, Google 비활성. Google Client ID/Secret과 Custom SMTP가 비어 있습니다. 운영·로컬 `/auth/callback` 허용 주소는 등록하고 재조회로 확인했습니다. 기존 Site URL과 메일 템플릿은 유지했습니다. 실제 이메일 수신과 Google 로그인 성공은 아직 검증하지 않았습니다.

Supabase 프로젝트를 공유하므로 Auth 사용자 목록·인증 제공자·메일 설정·리소스 한도는 공유합니다. DB 전용 계정의 권한 분리가 별도 Supabase 프로젝트 수준의 격리를 뜻하지 않습니다. Storage용 `SUPABASE_SECRET_KEY` 역시 프로젝트 전체 권한을 가지므로 서버에서만 사용합니다.

이미 적용된 DB에 아래 마이그레이션을 다시 수동 붙여넣지 않습니다. 이후 변경은 MCP 마이그레이션 또는 별도 관리용 `DATABASE_MIGRATION_URL`로 적용합니다. 제한된 `DATABASE_URL`은 스키마 변경 권한이 없으며, 관리용 연결값을 Vercel에 등록하지 않습니다.

```sh
npm ci
npm run db:migrate
npm run storage:setup
```

- `supabase/migrations/`는 PostgreSQL 스키마의 기준입니다. `db:migrate`는 줄바꿈을 LF로 정규화한 파일 체크섬·실행 이력을 기록하고 트랜잭션으로 적용합니다. MCP 최초 적용도 같은 파일 체크섬을 `value_lens._migrations`에 기록했습니다. 실패 시 해당 실행을 롤백하며 앱 시작 때 자동 마이그레이션하지 않습니다.
- 데이터는 `public` 대신 비공개 `value_lens` 스키마에 둡니다. 모든 업무 테이블에 RLS를 켜고 `anon`/`authenticated`에 직접 접근을 주지 않습니다.
- 서버 연결은 트랜잭션 안에서 `value_lens_app` 역할로 제한합니다. 이 역할은 스키마 변경 권한 없이 필요한 테이블의 CRUD만 할 수 있습니다. 조직 소속·활성 여부·프로젝트 배정은 API가 매 요청 확인합니다.
- `server/postgres-connection.mjs`는 Supabase 공식 루트 CA를 포함하고 TLS 인증서·호스트 검증을 유지합니다. 연결 문자열의 SSL 검증 해제 옵션은 사용하지 않습니다. 실제 공유 풀 접속에서 발생한 `SELF_SIGNED_CERT_IN_CHAIN`을 검증 해제 없이 해결했습니다.
- DB 작업은 Serializable 트랜잭션이며 충돌 시 최대 2회 재시도합니다. 기존 버전 비교, 중복 요청 처리, 집행 승인, 감사 기록을 한 트랜잭션으로 유지합니다.
- `storage:setup`은 **private** 버킷과 파일당 **25MiB** 제한을 생성·검사합니다. 공개 버킷이나 제한이 다른 기존 버킷은 자동 변경하지 않고 실패합니다. 형식별 MIME 제한은 추가하지 않습니다.
- 파일은 Vercel 함수를 통과시키지 않습니다. 준비 요청 → 조직 한도 예약 → 변경 불가한 경로에 서명 업로드 → 서버가 크기/권한/프로젝트 상태 재확인 → DB 원본 등록입니다. 원본 경로를 덮어쓰지 않습니다.
- 다운로드는 매번 권한 확인 후 60초 서명 URL을 반환합니다. URL을 받은 사용자는 만료 전까지 이용할 수 있으므로 즉시 권한 회수의 최대 지연은 60초입니다.
- 업로드 예약은 2시간이며 미완료 예약은 선언한 크기를 속이는 과다 업로드를 막기 위해 건당 25MiB를 예약하며, 만료되더라도 원본 정리가 끝날 때까지 조직당 500MiB 한도에 포함합니다. `npm run storage:cleanup`은 만료 후 1시간이 더 지난 미완료 원본만 최대 100개 정리합니다. 실행 주기 자동화는 아직 등록하지 않았습니다.

## 이메일 인증과 Google 로그인

시작 화면에는 **이메일로 가입·로그인**과 **Google로 계속하기**를 함께 표시합니다. 이메일은 비밀번호 없이 인증 링크를 받는 방식입니다. 처음 사용하는 이메일은 인증 후 가입되고, 기존 계정은 같은 방식으로 로그인합니다. 인증을 요청한 것만으로는 세션이나 조직을 만들지 않습니다.

회원가입은 공개입니다. 개인 이메일도 허용하며 가입 전에 조직 소속, 조직 초대, 조직 키, Google 계정을 요구하지 않습니다. 인증 후 조직이 없는 사용자도 로그인 상태로 조직 선택 화면을 열고 새 조직을 만들 수 있습니다. 조직 데이터 권한은 로그인 이후 각 조직 API에서 별도로 검사합니다. 메일 제공자의 테스트 발송 제약을 조직 가입 자격으로 적용하지 않습니다.

Supabase Auth에서 Email provider를 활성화합니다. Confirm signup과 Magic Link 메일 템플릿은 기본 `{{ .ConfirmationURL }}` 링크를 유지합니다. 서버가 PKCE challenge와 `APP_URL/auth/callback`을 지정하고, 이메일 링크의 인증 코드를 검증한 뒤 HttpOnly 세션 쿠키를 발급합니다. 요청한 브라우저에서 링크를 열어야 하며, 초대 링크의 이메일·조직 이동 경로도 유지합니다. 60초 재전송 안내와 공급자 발송 제한·오류 처리를 포함합니다.

실제 이용자에게 발송하려면 Supabase의 Custom SMTP를 설정하고 발신 도메인을 인증해야 합니다. 기본 발송 서비스는 프로젝트 팀원 이메일·낮은 발송 한도로 제한될 수 있어 외부 회원가입의 운영 발송에 사용하지 않습니다. 이메일 템플릿에서 `ConfirmationURL`을 `TokenHash` 전용 링크로 임의 교체하지 않습니다.

`/api/session`은 Supabase `/auth/v1/settings`의 Email·Google 활성화 상태를 확인합니다. 환경변수만 입력했다고 Google OAuth 연결을 완료로 표시하지 않습니다. 공급자 활성 여부는 OAuth 클라이언트·SMTP의 실제 작동 검증을 대신하지 않습니다.

Supabase Auth → Providers에서 Google OAuth를 설정합니다. Google Cloud의 OAuth redirect URI는 `https://tcodixafsipheefvuouc.supabase.co/auth/v1/callback`입니다. 공유 프로젝트의 기존 **Site URL과 메일 템플릿을 덮어쓰지 않습니다.** Redirect URLs의 기존 항목을 유지하면서 `https://evaluation-jejuai.vercel.app/auth/callback`과 로컬 개발용 `http://127.0.0.1:5173/auth/callback`을 추가합니다. 앱은 명시적으로 `APP_URL/auth/callback`을 지정합니다. Google Client Secret은 Supabase Provider 설정에 저장합니다.

현재 MCP에는 Auth 설정 수정·Secret Key 조회 도구가 없어 사용자가 등록한 PAT로 공식 Management API를 사용했습니다. 인증 설정 읽기·복귀 URL 추가·기존 서버 키 조회를 완료했습니다. PAT는 프로젝트 범위를 `projecthub`로 제한하고 Auth Config와 Project Settings는 Read-write, API Keys와 API Key Secrets는 Read로 설정합니다. Auth 설정 변경 API는 Site URL 변경 여부와 무관하게 Auth Config와 Project Settings 쓰기 권한을 모두 요구합니다. 관리 토큰은 로컬 `SUPABASE_ACCESS_TOKEN`으로만 사용하고 Vercel·브라우저·Git에 전달하지 않습니다.

로그인 후 빈 조직 만들기 → 조직 관리에서 다른 이메일 초대 → 초대받은 Google 계정 로그인 → 프로젝트 배정 순서로 확인합니다. 조직 관리자 역할은 DB 소속 기록으로 판단하며 사용자 프로필 메타데이터를 권한으로 신뢰하지 않습니다. 전체 관리자 설정은 서버 환경변수의 검증된 사용자 ID를 사용합니다.

## 기존 배포/데이터와 범위

- `*.chatgpt.site`는 이전 Sites 배포입니다. 이번 GitHub 푸시는 그 배포나 DB를 변경하지 않습니다. 현재 저장소에는 랜딩을 함께 포함하며 새 Vercel 도메인의 `/`가 소개, `/app?mode=demo#/home`이 데모, `/app?mode=start#/start`가 로그인·조직 시작입니다. 소개와 작업실 사이의 이동은 같은 도메인 안에서 이뤄집니다. 이전 `/?mode=…` 북마크도 유지합니다.
- 기존 D1/R2 데이터는 PostgreSQL/Storage로 **자동 복사하지 않습니다**. 실제 사용 데이터가 있으면 읽기 전용 내보내기, 계정 ID 매핑, 파일 개수·크기·버전 검증 후 별도 이관합니다. DB 스키마 전환으로 사용자 데이터를 추측해 합치지 않습니다.
- `drizzle/`, `build/`, `.openai/`, 기존 Sites 스크립트는 이전 환경의 참고 자료입니다. 현재 Vercel 빌드에서 호출하지 않습니다. 새 DB에는 `db:migrate`를 사용합니다.
- 브라우저 데모 데이터는 origin별로 분리됩니다. Sites에서 남긴 데모 기록은 새 Vercel 주소로 자동 이전되지 않습니다.
- 조직 JSON의 1MiB 제한 등 기존 운영 규모 제한은 유지합니다. OCR·STT·TTS, 실제 송금, 다단계 결재, HWPX 보고서 출력, 원본 문서 편집, 백업 복구·부하 검증은 이번 배포 전환으로 완료되는 기능이 아닙니다.

## 검증

```sh
npm run typecheck
npm test
npm run build:vercel
npm run verify:vercel
npm run check:services
```

기존 서버 테스트를 PostgreSQL WASM 엔진(PGlite)과 실제 마이그레이션·어댑터로 실행합니다. `check:services`는 비밀값 없이 연결 상태를 출력하며, 미설정 항목이 있으면 종료 코드 2를 반환합니다. 실제 DB 연결·권한·롤백과 Storage 왕복·비공개 접근 차단을 확인했습니다. 두 계정 Google 로그인·이메일 수신·조직 간 API 접근 검증은 인증 설정 후 별도로 수행해야 합니다. Vercel 함수 산출물의 로컬 실행과 실제 Vercel 호스팅 배포는 구분합니다.

참고: [Vinext의 Nitro 배포](https://github.com/cloudflare/vinext#other-platforms-via-nitro), [Nitro Vercel](https://nitro.build/deploy/providers/vercel), [Vercel Build Output](https://vercel.com/docs/build-output-api/configuration), [Supabase 연결](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control).
