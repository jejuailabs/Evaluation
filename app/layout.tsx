import type { Metadata } from 'next';
import '../src/ui/styles.css';
export const metadata:Metadata={title:'가치 돋보기 · 우리 조직의 작업실',description:'우리 조직의 프로젝트, 자료, 예산과 성과를 한곳에서 관리해요.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
