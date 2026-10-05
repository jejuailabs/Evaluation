import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles.css';

class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''};
  static getDerivedStateFromError(error:Error){return{error:error.message};}
  render(){if(this.state.error)return <div className="fatal"><h1>자료를 안전하게 불러오지 못했어요.</h1><p>{this.state.error}</p><p>기존 저장 내용은 덮어쓰지 않았어요.</p><button onClick={()=>location.reload()}>다시 불러오기</button></div>;return this.props.children;}
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
