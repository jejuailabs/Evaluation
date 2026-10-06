# 가치 돋보기 인증메일

2026-10-06 Supabase Management API로 운영 Auth에 적용하고 네 설정값을 다시 조회해 일치 확인했다. Vercel 재배포와 별개로 다음 인증메일부터 적용된다. 기존에 받은 메일은 바뀌지 않는다.

| 파일 | Supabase 설정 |
| --- | --- |
| `magic-link.html` | `mailer_templates_magic_link_content` |
| `confirmation.html` | `mailer_templates_confirmation_content` |
| `subjects.json` | 로그인·가입 인증메일 제목 |

- 운영 복귀 주소 `.RedirectTo`가 `https://evaluation-five-xi.vercel.app/auth/callback`인 경우에만 가치 돋보기 문구를 사용한다. 공유 프로젝트의 다른 서비스에는 기존 제목과 본문을 유지한다. 새 운영 도메인을 추가하면 이 조건도 함께 갱신한다.
- 버튼은 기존 `{{ .ConfirmationURL }}`을 사용한다. 인증 방식·PKCE·만료시간·이메일 확인 정책·SMTP 설정은 변경하지 않는다.
- 제목과 본문은 Supabase의 Go Template 조건문을 사용한다. 사용자 메타데이터로 서비스 브랜드를 선택하지 않는다.
- 숫자 OTP 입력 화면과 서버 검증을 추가했다. 메일에 `{{ .Token }}`을 표시하며 기존 링크 버튼도 함께 유지한다. 하나로 인증하면 다른 방법으로 재사용할 수 없다.
- 운영 설정 저장·재조회 및 모바일 390px 미리보기에서 버튼·문구·가로 넘침 없음 확인. 이번 수정으로 실제 메일을 보내거나 인증 링크를 소비하지 않았다.

참고: [Supabase 이메일 템플릿](https://supabase.com/docs/guides/auth/auth-email-templates), [공식 제목·본문 템플릿 렌더러](https://github.com/supabase/auth/blob/master/internal/mailer/templatemailer/template.go).
