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

| 이름 | 값/용도 |
| --- | --- |
| `DATABASE_URL` | **이 서비스용** Supabase 프로젝트의 Connect → Transaction pooler 연결 문자열(6543). DB 비밀번호 포함. 서버는 풀 최대 2개, TLS 인증서 검증, 이름 있는 prepared statement 없이 사용 |
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

MCP 목록에는 현재 `projecthub`만 활성 상태이며 Evaluation 전용 프로젝트는 확인되지 않았습니다. 다른 서비스의 DB를 임의로 변경하지 않았습니다. 사용할 프로젝트를 정한 뒤 연결값을 `.env.local`에 넣습니다. 비밀번호나 Secret Key를 채팅에 보낼 필요는 없습니다.

```sh
npm ci
npm run db:migrate
npm run storage:setup
```

- `supabase/migrations/`는 새 PostgreSQL 스키마의 기준입니다. `db:migrate`는 파일 체크섬·실행 이력을 기록하고 트랜잭션으로 적용합니다. 실패 시 해당 실행을 롤백하며 앱 시작 때 자동 마이그레이션하지 않습니다.
- 데이터는 `public` 대신 비공개 `value_lens` 스키마에 둡니다. 모든 업무 테이블에 RLS를 켜고 `anon`/`authenticated`에 직접 접근을 주지 않습니다.
- 서버 연결은 트랜잭션 안에서 `value_lens_app` 역할로 제한합니다. 이 역할은 스키마 변경 권한 없이 필요한 테이블의 CRUD만 할 수 있습니다. 조직 소속·활성 여부·프로젝트 배정은 API가 매 요청 확인합니다.
- DB 작업은 Serializable 트랜잭션이며 충돌 시 최대 2회 재시도합니다. 기존 버전 비교, 중복 요청 처리, 집행 승인, 감사 기록을 한 트랜잭션으로 유지합니다.
- `storage:setup`은 **private** 버킷과 파일당 **25MiB** 제한을 생성·검사합니다. 공개 버킷이나 제한이 다른 기존 버킷은 자동 변경하지 않고 실패합니다. 형식별 MIME 제한은 추가하지 않습니다.
- 파일은 Vercel 함수를 통과시키지 않습니다. 준비 요청 → 조직 한도 예약 → 변경 불가한 경로에 서명 업로드 → 서버가 크기/권한/프로젝트 상태 재확인 → DB 원본 등록입니다. 원본 경로를 덮어쓰지 않습니다.
- 다운로드는 매번 권한 확인 후 60초 서명 URL을 반환합니다. URL을 받은 사용자는 만료 전까지 이용할 수 있으므로 즉시 권한 회수의 최대 지연은 60초입니다.
- 업로드 예약은 2시간이며 미완료 예약은 선언한 크기를 속이는 과다 업로드를 막기 위해 건당 25MiB를 예약하며, 만료되더라도 원본 정리가 끝날 때까지 조직당 500MiB 한도에 포함합니다. `npm run storage:cleanup`은 만료 후 1시간이 더 지난 미완료 원본만 최대 100개 정리합니다. 실행 주기 자동화는 아직 등록하지 않았습니다.

## Google 로그인

Supabase Auth → Providers에서 Google OAuth를 설정합니다. Google Cloud의 OAuth redirect URI는 Supabase가 표시하는 callback URL을 사용합니다. Supabase의 Site URL에는 `APP_URL`, Redirect URLs에는 `APP_URL/auth/callback`을 등록합니다. Google Client Secret은 Supabase Provider 설정에 저장합니다.

로그인 후 빈 조직 만들기 → 조직 관리에서 다른 이메일 초대 → 초대받은 Google 계정 로그인 → 프로젝트 배정 순서로 확인합니다. 조직 관리자 역할은 DB 소속 기록으로 판단하며 사용자 프로필 메타데이터를 권한으로 신뢰하지 않습니다. 전체 관리자 설정은 서버 환경변수의 검증된 사용자 ID를 사용합니다.

## 기존 배포/데이터와 범위

- `*.chatgpt.site`는 이전 Sites 배포입니다. 이번 GitHub 푸시는 그 배포나 DB를 변경하지 않습니다. Vercel 배포 성공 후 랜딩의 시작/데모 링크를 새 주소로 변경해야 합니다.
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
```

기존 서버 테스트를 PostgreSQL WASM 엔진(PGlite)과 실제 마이그레이션·어댑터로 실행합니다. 외부 Supabase 프로젝트의 실제 두 계정 Google 로그인·Storage 왕복 검증은 환경 설정 후 별도로 수행해야 합니다. Vercel 함수 산출물의 로컬 실행과 실제 Vercel 호스팅 배포는 구분합니다.

참고: [Vinext의 Nitro 배포](https://github.com/cloudflare/vinext#other-platforms-via-nitro), [Nitro Vercel](https://nitro.build/deploy/providers/vercel), [Vercel Build Output](https://vercel.com/docs/build-output-api/configuration), [Supabase 연결](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control).
