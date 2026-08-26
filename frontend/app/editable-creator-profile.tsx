"use client";

import { useState } from "react";

export function EditableCreatorProfile({ onPublish, onNeed, flash }: { onPublish: () => void; onNeed: () => void; flash: (s: string) => void }) {
  const [editing,setEditing]=useState(false);
  const [avatar,setAvatar]=useState("");
  const [creatorTitle,setCreatorTitle]=useState("AI 网页与小游戏创作者");
  const [bio,setBio]=useState("前互联网产品经理，持续创作可点、可玩、可用的网页作品。擅长把模糊想法整理成互动 H5、小游戏、数据看板与实用工具。");
  const services=[["互动 H5／营销页","抽奖、集卡、邀请函、活动落地页","¥800 起"],["网页小游戏","解谜、跳跃、品牌互动玩法","¥1,500 起"],["数据看板","榜单、趋势与表格导入","¥1,200 起"],["AI 实用工具","生成器、问答与知识库应用","¥2,000 起"]];
  const works=[["高考志愿智能填报模拟器","¥19.9 起","scene-1"],["AI 塔罗牌占卜","免费","scene-2"],["松弛感旅行规划器","免费","scene-3"]];
  return <section className="page"><div className="shell"><div className="page-head"><span>认证创作者</span><h1>林小满</h1><p>{creatorTitle} · 擅长互动 H5、数据可视化、AI 工具</p></div>
    <div className="profile-command"><label className="profile-avatar editable-avatar" style={avatar?{backgroundImage:`url(${avatar})`}:undefined}>{avatar?null:"林"}<input aria-label="上传头像" type="file" accept="image/*" onChange={(e)=>{const file=e.target.files?.[0];if(file){setAvatar(URL.createObjectURL(file));flash("头像已更新");}}}/><span>更换头像</span></label><div><span className="verified-pill">✓ 认证创作者</span><div className="profile-tags"><span>互动网页</span><span>小游戏</span><span>AI 工具</span><span>数据可视化</span></div></div><div className="profile-actions"><button className="secondary" onClick={()=>setEditing(!editing)}>{editing?"收起编辑":"编辑主页"}</button><button className="primary" onClick={onPublish}>发布作品</button></div></div>
    {editing&&<section className="profile-editor"><div><label>官方身份标题<input value={creatorTitle} onChange={(e)=>setCreatorTitle(e.target.value)}/></label><button className="secondary" onClick={()=>{setCreatorTitle("互动网页与数据体验设计师");flash("已生成官方身份标题");}}>生成官方标题</button></div><label>个人介绍<textarea value={bio} onChange={(e)=>setBio(e.target.value)}/></label><button className="primary" onClick={()=>{setEditing(false);flash("个人主页已保存");}}>保存主页</button></section>}
    <div className="profile-metrics-next"><div><b>36</b><span>上架作品</span></div><div><b>4.9</b><span>好评分</span></div><div><b>128</b><span>已成交</span></div><div><b>2 小时</b><span>平均响应</span></div><div className="available"><b>当前可接单</b><span>互动网页与数据项目</span></div></div>
    <div className="profile-columns"><div className="profile-main-next"><section className="profile-panel"><h2>关于林小满</h2><p>{bio}</p><div className="profile-facts"><span>上海</span><span>入驻 8 个月</span><span>中文／English</span></div></section><section className="profile-panel"><h2>可提供的服务</h2><div className="service-list">{services.map(x=><div key={x[0]}><div><b>{x[0]}</b><span>{x[1]}</span></div><strong>{x[2]}</strong></div>)}</div><button className="primary" onClick={onNeed}>找 TA 定制</button></section><section className="profile-panel"><div className="panel-title"><h2>作品货架</h2><span>36 件作品</span></div><div className="profile-work-grid">{works.map((w)=><button key={w[0]} onClick={()=>flash(`已打开「${w[0]}」`)}><i className={w[2]}/><b>{w[0]}</b><span>{w[1]}</span></button>)}</div></section></div><aside className="profile-side-next"><section className="profile-panel"><h2>买家评价</h2><b className="rating">4.9 <span>112 条真实成交评价</span></b><blockquote>“沟通直接，两天完成活动页，交付比预期更清楚。”</blockquote><blockquote>“数据看板结构专业，团队很快就能开始使用。”</blockquote></section><section className="profile-panel"><h2>联系方式</h2><p>正在寻找创作者的用户可以通过定制合作联系。</p><button className="secondary wide" onClick={()=>flash("联系方式编辑已打开")}>完善联系方式</button></section></aside></div>
  </div></section>;
}
