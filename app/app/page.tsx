"use client";
import { Component, useEffect, useState, type ReactNode } from 'react';
import App from '../../src/App';
import { Accounts } from '../../src/features/Accounts';
class Boundary extends Component<{children:ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return{error:e.message};}render(){return this.state.error?<div className="fatal"><h1>작업실을 불러오지 못했어요.</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>다시 불러오기</button></div>:this.props.children;}}
export default function Page(){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);if(!ready)return <div className="fatal" role="status">가치 돋보기를 열고 있어요…</div>;const mode=new URLSearchParams(location.search).get('mode');return <Boundary>{mode==='demo'||mode==='preview'?<App/>:<Accounts/>}</Boundary>;}
