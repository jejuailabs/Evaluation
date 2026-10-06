export const targetLabels={project:'프로젝트',task:'업무',activity:'현장 기록',document:'자료',measurement:'실적',expense:'집행'} as const;
export type TargetType=keyof typeof targetLabels;
export type DiscussionTarget={projectId:string;type:TargetType;id:string};
export type ProjectComment={id:string;seq:number;authorId:string;authorName:string;body:string;mentions:string[];version:number;createdAt:string;updatedAt:string|null;deletedAt:string|null;canEdit:boolean;canDelete:boolean;edits:{body:string;at:string}[]};
export type DiscussionPage={comments:ProjectComment[];nextCursor:number|null;targetName:string;participants:{id:string;name:string}[];canPost:boolean};
export type AppNotification={id:string;seq:number;title:string;kind:string;createdAt:string;readAt:string|null;target:DiscussionTarget};
export type NotificationPage={items:AppNotification[];nextCursor:number|null;unread:number};
export type OrganizationChanges={revision:number;role:string;unread:number;latestNotification:number};
export function discussionHref(t:DiscussionTarget){return `#/projects/${encodeURIComponent(t.projectId)}/discussion/${t.type}/${encodeURIComponent(t.id)}`;}
