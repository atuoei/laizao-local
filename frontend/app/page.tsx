"use client";

import { useEffect, useMemo, useState } from "react";
import "./mentor.css";
import "./operations.css";
import "./footer-admin.css";
import "./style-law.css";
import "./creator-editor.css";
import { EditableCreatorProfile } from "./editable-creator-profile";
import { NativeToolsView } from "./native-tools";
import { approveWork, archiveWork, clearSession, confirmOfflinePayment, createOrder, deployStaticWork, getCreatorDashboard, getCurrentUser, getEntitlements, getFunnel, getMarketplace, getMyOrders, getOfflinePaymentInfo, getPendingOfflinePayments, getPendingReviews, getWorkVersions, loginWithPassword, openOwnedSource, publishWork, registerWithPassword, rejectWork, releaseWorkVersion, savePaymentQr, simulatePaymentFailed, simulatePaymentSuccess, simulateRefund, submitPaymentProof, trackWorkTried, trackWorkViewed, updateWork, upgradeOwnedWork, uploadCoverImage, uploadWorkPackage, type AppUser, type CreatorDashboard, type Funnel, type MarketplaceItem, type MyOrder, type MyWork, type OfflinePaymentInfo, type OwnedWork, type PendingOfflinePayment, type ReviewWork, type WorkVersionHistory } from "./vibe-api";

const OFFICIAL_TOOLS_URL = "/?view=official-tools";

type View =
  | "home" | "map" | "explore" | "official-tools" | "wish" | "work" | "market-detail" | "experience" | "squishy-trial" | "entitlements" | "my-orders" | "mentor" | "profile"
  | "creator" | "create" | "publish" | "orders" | "demand-detail" | "quote" | "workspace"
  | "need" | "need-draft" | "match" | "accept"
  | "enterprise" | "catalog" | "procure" | "consult" | "poc" | "project"
  | "platform" | "admin-login" | "admin-overview" | "admin-review" | "admin-reports"
  | "admin-contributors" | "admin-audit" | "admin-config";

type TrailItem = { view: View; label: string };
type NeedAnalysis = {
  assistantMessage: string;
  summaryTitle: string;
  objective: string;
  userGroup: string;
  requiredCapabilities: string[];
  deadline: string;
  match: { name: string; type: string; fit: number; reason: string; missing: string[] };
  nextAction: "use_existing" | "external_prompt" | "custom_request";
};
type UiIconName = "home" | "search" | "idea" | "profile" | "more" | "publish" | "order" | "enterprise" | "path" | "creator" | "document" | "mentor" | "analysis" | "security" | "testing" | "web" | "skill" | "agent" | "wallet" | "settings";

const works = [
  { id: 1, icon: "旅", type: "网页", title: "松弛感旅行规划器", desc: "把预算、天数和偏好变成可执行的路线与清单。", author: "乔木", price: "免费", uses: "12.8k", tone: "mint", enterprise: true },
  { id: 2, icon: "豆", type: "Skill", title: "拼豆图纸生成 Skill", desc: "上传图片，自动生成色号、材料清单和拼豆图纸。", author: "阿白", price: "3 Token/次", uses: "8.6k", tone: "amber", enterprise: true },
  { id: 3, icon: "写", type: "Skill", title: "品牌内容共创 Skill", desc: "整理品牌语气、选题、初稿和审核流程。", author: "林昼", price: "¥29/月", uses: "6.2k", tone: "violet", enterprise: true },
  { id: 4, icon: "餐", type: "网页", title: "一周健康餐搭配", desc: "按人数、忌口和目标生成菜单与采购清单。", author: "来造官方", price: "免费", uses: "21k", tone: "blue", enterprise: false },
];

const officialTools = [
  { icon:"走", name:"半小时出走", desc:"30 分钟城市微旅行互动网页。", tag:"生活方式", source:"来造", uses:"网页" },
  { icon:"豆", name:"拼豆图纸生成器", desc:"上传图片，生成色号、材料清单和拼豆图纸。", tag:"来造工具", source:"来造", uses:"1.2 万" },
  { icon:"拼", name:"模板拼图", desc:"使用网格模板完成多图排版，并导出高清图片。", tag:"图像处理", source:"来造" },
  { icon:"抠", name:"一键抠图", desc:"移除纯色或近似纯色背景，导出透明 PNG。", tag:"图像处理", source:"来造" },
  { icon:"词", name:"提词器", desc:"适用于视频录制和直播场景的站内提词工具。", tag:"内容创作", source:"来造" },
  { icon:"板", name:"在线白板", desc:"打开即用的在线白板，可书写并下载图片。", tag:"效率协作", source:"来造" },
  { icon:"大", name:"图片高清放大", desc:"在浏览器本地将图片高质量放大二至四倍。", tag:"图像处理", source:"来造" },
  { icon:"写", name:"智能文案撰稿", desc:"按主题、平台和语气生成可编辑文案初稿。", tag:"内容创作", source:"来造" },
  { icon:"合", name:"PDF 合并", desc:"在浏览器本地将多个 PDF 按顺序合并。", tag:"文档处理", source:"来造" },
];

const adminViews: View[] = ["admin-overview","admin-review","admin-reports","admin-contributors","admin-audit","admin-config"];

const paths = [
  { group: "内容消费者", title: "尝鲜新作品", desc: "发现 → 体验 → 分享 → 继续探索", target: "explore" as View, icon: "✦" },
  { group: "内容消费者", title: "长期使用固定内容", desc: "收藏 → 保存配置 → 重复使用 → 订阅更新", target: "experience" as View, icon: "↻" },
  { group: "个人需求方", title: "从作品发起做同款", desc: "体验作品 → 做同款 → 形成需求 → 找创作者", target: "work" as View, icon: "◎" },
  { group: "个人需求方", title: "直接发布明确需求", desc: "描述问题 → 推荐已有作品 → 发布 → 撮合交易", target: "need" as View, icon: "→" },
  { group: "创作者", title: "外部创作与站内发布", desc: "自己的 Agent／AI 平台完成 → 导入 → 审核 → 发布", target: "create" as View, icon: "造" },
  { group: "创作者", title: "承接个人需求", desc: "需求市场 → 报价 → 制作 → 交付 → 结算", target: "orders" as View, icon: "接" },
  { group: "企业用户", title: "采购已有作品", desc: "企业目录 → 试用 → 授权 → 开通", target: "catalog" as View, icon: "采" },
  { group: "企业用户", title: "平台咨询与定制", desc: "诊断 → PoC → 平台实施 → 上线运维", target: "consult" as View, icon: "企" },
  { group: "平台", title: "审核、治理与交易保障", desc: "内容分级 → 算力计费 → 风控 → 数据闭环", target: "platform" as View, icon: "台" },
];

const stepsByView: Partial<Record<View, string[]>> = {
  create: ["作品信息", "封面图", "作品形态", "使用去向", "权限与价格", "提交"],
  need: ["描述需求", "匹配已有内容", "形成需求", "选择创作者", "订单"],
  quote: ["看清需求", "评估能力", "方案报价", "确认条款", "开工"],
  procure: ["申请演示", "选择授权", "确认费用", "企业采购", "开通"],
  consult: ["业务问题", "需求诊断", "方案与指标", "签约", "PoC"],
};

const iconMap: Record<string, UiIconName> = {
  "✦":"idea", "↻":"settings", "◎":"path", "→":"path", "↗":"analysis",
  "造":"creator", "接":"order", "采":"publish", "企":"enterprise", "台":"settings",
  "✓":"testing", "来":"agent", "诊":"analysis", "作":"creator", "审":"testing",
  "搜":"search", "单":"order", "币":"wallet", "算":"analysis", "盾":"security",
};

function UiIcon({ name, size="normal" }: { name: UiIconName; size?: "small"|"normal"|"large" }) {
  return <span className={`ui-icon ui-icon-${name} ui-icon-${size}`} aria-hidden="true" />;
}

function Icon({ children }: { children: React.ReactNode }) {
  const key = typeof children === "string" ? children : "";
  return <span className="iconbox" aria-hidden="true"><UiIcon name={iconMap[key] || "idea"} /></span>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [trail, setTrail] = useState<TrailItem[]>([{ view: "home", label: "首页" }]);
  const [toast, setToast] = useState("");
  const [createStep, setCreateStep] = useState(0);
  const [needStep, setNeedStep] = useState(0);
  const [consultStep, setConsultStep] = useState(0);
  const [procureStep, setProcureStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [needAnalysis, setNeedAnalysis] = useState<NeedAnalysis | null>(null);
  const [selected, setSelected] = useState({ method: "填写链接", title: "", description: "", tags: "网页, 来造", coverUrl: "", sourceUrl: "", trialUrl: "", priceYuan: "0", format: "网页", destination: "站内分享", access: "公开", pricing: "免费体验" });
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<MarketplaceItem | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<MarketplaceItem | null>(null);
  const [workFile, setWorkFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [selectedMarketWork, setSelectedMarketWork] = useState<MarketplaceItem | null>(null);

  useEffect(()=>{
    const queryView = new URLSearchParams(window.location.search).get("view");
    if(queryView !== "official-tools" && queryView !== "squishy-trial")return;
    queueMicrotask(()=>{
      if(queryView === "squishy-trial") {
        setView("squishy-trial");
        setTrail([{view:"home",label:"首页"},{view:"squishy-trial",label:"解压捏捏乐 · 免费体验"}]);
      } else {
        setView("official-tools");
        setTrail([{view:"home",label:"首页"},{view:"official-tools",label:"官方工具"}]);
      }
    });
  },[]);

  async function refreshMarketplace() {
    try {
      setMarketplace(await getMarketplace());
    } catch {
      flash("本地市场暂不可用，请确认 Docker 服务已启动");
    }
  }

  async function publishToMarketplace() {
    const trialUrl = selected.method === "填写链接" ? selected.sourceUrl.trim() : selected.trialUrl.trim();
    if (!selected.title.trim() || !selected.description.trim() || (selected.method === "填写链接" && !selected.sourceUrl.trim()) || (selected.method === "导入文件" && !workFile) || (selected.method === "填写链接" && !trialUrl)) {
      flash("请先填写标题、简介、作品来源和购买前体验链接");
      return;
    }
    const priceYuan = Number(selected.priceYuan);
    if (!Number.isFinite(priceYuan) || priceYuan < 0) {
      flash("请填写正确的价格");
      return;
    }
    const priceCents = Math.round(priceYuan * 100);
    try {
      const sourceUrl = selected.method === "导入文件" && workFile ? (await uploadWorkPackage(workFile)).source_url : selected.sourceUrl.trim();
      const coverUrl = coverFile ? (await uploadCoverImage(coverFile)).source_url : selected.coverUrl.trim();
      await publishWork({
        title: selected.title.trim(),
        description: selected.description.trim(),
        tags: selected.tags.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean),
        priceCents,
        sourceUrl,
        coverUrl,
        trialUrl,
        autoDeployStatic: selected.method === "导入文件",
      });
      await refreshMarketplace();
      flash("作品已提交审核，通过后会出现在交易市场");
      go("explore", "作品广场");
    } catch (error) {
      flash(error instanceof Error ? error.message : "发布失败，请稍后重试");
    }
  }

  async function createPurchaseOrder(item: MarketplaceItem) {
    try {
      await trackWorkViewed(item.work_id, item.listing_id);
      await createOrder(item.listing_id);
      flash(`「${item.title}」订单已创建，请完成模拟支付`);
      setCheckoutItem(null);
      go("my-orders", "我的订单");
    } catch (error) {
      const message = error instanceof Error ? error.message : "购买失败，请稍后重试";
      if (message.includes("购买自己的作品")) {
        flash("不能用发布者账号购买自己的作品；请退出后用另一个手机号作为买家测试");
      } else if (message.includes("已拥有")) {
        flash("你已获得该作品，正在打开我的权益");
        go("entitlements", "我的权益");
      } else {
        flash(message);
      }
    }
  }

  function purchaseFromMarketplace(item: MarketplaceItem) {
    if (!currentUser) {
      setPendingPurchase(item);
      setAuthOpen(true);
      flash("请先登录，登录后可确认获取作品");
      return;
    }
    setCheckoutItem(item);
  }

  useEffect(() => { void refreshMarketplace(); }, []);
  useEffect(() => { getCurrentUser().then(setCurrentUser).catch(() => clearSession()); }, []);

  const activeSteps = useMemo(() => {
    if (view === "create" || view === "publish") return { steps: stepsByView.create!, at: createStep };
    if (["need", "need-draft", "match", "accept"].includes(view)) return { steps: stepsByView.need!, at: needStep };
    if (["consult", "poc", "project"].includes(view)) return { steps: stepsByView.consult!, at: consultStep };
    if (view === "procure") return { steps: stepsByView.procure!, at: procureStep };
    return null;
  }, [view, createStep, needStep, consultStep, procureStep]);
  const isAdminView = adminViews.includes(view);
  const canAccessAdmin = Boolean(currentUser?.is_admin);

  function go(next: View, label: string) {
    if (adminViews.includes(next) && !currentUser?.is_admin) {
      setView("admin-login");
      setTrail([{ view: "home", label: "首页" }, { view: "admin-login", label: "管理员登录" }]);
      flash("该页面仅限管理员访问，请使用管理员账号登录");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setView(next);
    setTrail((prev) => [...prev.filter((x) => x.view !== next), { view: next, label }].slice(-5));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function jump(next: View, label: string) {
    if (adminViews.includes(next) && !currentUser?.is_admin) {
      setTrail([{ view: "home", label: "首页" }, { view: "admin-login", label: "管理员登录" }]);
      setView("admin-login");
      flash("该页面仅限管理员访问，请使用管理员账号登录");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setTrail([{ view: "home", label: "首页" }, { view: next, label }]);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(key: keyof typeof selected, value: string) {
    setSelected((s) => ({ ...s, [key]: value }));
  }

  return (
    <main className={`next-app view-${view}`}>
      <header className="topbar">
        <div className="shell topbar-inner">
          <button className="brand" onClick={() => jump("home", "首页")}><span>来</span>来造 Next <small>AI WORKS</small></button>
          <nav aria-label="主导航">
            <button className={view === "home" ? "active" : ""} onClick={() => jump("home", "首页")}>首页</button>
            <button className={view === "official-tools" ? "active" : ""} onClick={() => jump("official-tools", "官方工具")}>官方工具</button>
            <button className={view === "explore" ? "active" : ""} onClick={() => jump("explore", "作品广场")}>作品广场</button>
            <button className={["enterprise", "need", "need-draft", "match", "accept", "catalog", "procure", "consult", "poc", "project"].includes(view) ? "active" : ""} onClick={() => jump("enterprise", "定制合作")}>定制合作</button>
            <button className={view === "wish" ? "active" : ""} onClick={() => jump("wish", "许愿池")}>许愿池</button>
          </nav>
          <div className="top-actions">
            <button className="ghost compact" onClick={() => jump("creator", "创作者中心")}>创作者中心</button>
            {currentUser ? <div style={{position:"relative"}}><button className="avatar" title="账户菜单" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(v=>!v)}>{currentUser.display_name.slice(0, 1)}</button>{accountMenuOpen&&<div role="menu" style={{position:"absolute",right:0,top:"calc(100% + 10px)",zIndex:100,width:210,padding:10,background:"#fff",border:"1px solid #dce3ef",boxShadow:"0 14px 32px rgba(18,35,70,.18)",color:"#17233d"}}><div style={{padding:"6px 8px 10px",borderBottom:"1px solid #edf0f5",marginBottom:6}}><b>{currentUser.display_name}</b><small style={{display:"block",color:"#73809a",marginTop:3}}>账号：{currentUser.username||"未设置"}</small></div><button className="text-btn wide" role="menuitem" onClick={()=>{setAccountMenuOpen(false);jump("creator","创作者中心");}}>创作者中心</button><button className="text-btn wide" role="menuitem" onClick={()=>{setAccountMenuOpen(false);jump("my-orders","我的订单");}}>我的订单</button><button className="text-btn wide" role="menuitem" onClick={()=>{setAccountMenuOpen(false);jump("entitlements","我的权益");}}>我的权益</button><button className="danger wide" role="menuitem" style={{marginTop:6}} onClick={()=>{clearSession();setCurrentUser(null);setAccountMenuOpen(false);flash("已退出登录");}}>退出登录</button></div>}</div> : <button className="ghost compact" onClick={() => setAuthOpen(true)}>登录 / 注册</button>}
          </div>
        </div>
      </header>

      <div className={view === "home" ? "product-frame home-frame" : isAdminView && canAccessAdmin ? "product-frame admin-frame" : "product-frame workspace-frame"}>
      {isAdminView && canAccessAdmin && <AdminNav view={view} jump={jump}/>}
      <section className="view-stage">
      {view !== "home" && <div className="crumbbar"><div className="shell crumbs">{trail.map((x, i) => <span key={`${x.view}-${i}`}><button onClick={() => jump(x.view, x.label)}>{x.label}</button>{i < trail.length - 1 && <b>›</b>}</span>)}</div></div>}

      {activeSteps && <div className="stepbar"><div className="shell steps">{activeSteps.steps.map((s, i) => <div key={s} className={i < activeSteps.at ? "done" : i === activeSteps.at ? "on" : ""}><span>{i < activeSteps.at ? "✓" : i + 1}</span>{s}</div>)}</div></div>}

      {view === "home" && <HomeView go={go} />}
      {view === "map" && <PathMap go={go} />}
      {view === "explore" && <ExploreView go={go} flash={flash} marketplace={marketplace} onBuy={purchaseFromMarketplace} onOpen={(item)=>{setSelectedMarketWork(item);go("market-detail",item.title);}} />}
      {view === "official-tools" && <OfficialToolsView go={go} flash={flash} />}
      {view === "wish" && <WishPool flash={flash} go={go} />}
      {view === "work" && <WorkView go={go} saved={saved} setSaved={setSaved} flash={flash} />}
      {view === "market-detail" && selectedMarketWork && <MarketplaceDetailView item={selectedMarketWork} go={go} onBuy={purchaseFromMarketplace} flash={flash} />}
      {view === "experience" && <ExperienceView go={go} flash={flash} />}
      {view === "squishy-trial" && <SquishyTrialView go={go} />}
      {view === "entitlements" && <EntitlementsView flash={flash} />}
      {view === "my-orders" && <MyOrdersView flash={flash} />}
      {view === "mentor" && <MentorView go={go} flash={flash} />}
      {view === "profile" && <EditableCreatorProfile onPublish={()=>go("create","发布作品")} onNeed={()=>go("need","找林小满定制")} flash={flash} />}
      {view === "creator" && <CreatorView key={currentUser?.id || "anonymous"} go={go} flash={flash} />}
      {view === "create" && <CreateView step={createStep} setStep={setCreateStep} selected={selected} choose={choose} workFile={workFile} setWorkFile={setWorkFile} coverFile={coverFile} setCoverFile={setCoverFile} go={go} flash={flash} />}
      {view === "publish" && <PublishSuccess go={go} selected={selected} onPublish={publishToMarketplace} />}
      {view === "orders" && <OrderMarket go={go} />}
      {view === "demand-detail" && <DemandDetail go={go} />}
      {view === "quote" && <QuoteView go={go} />}
      {view === "workspace" && <OrderWorkspace go={go} flash={flash} />}
      {view === "need" && <NeedView setStep={setNeedStep} go={go} flash={flash} onAnalyzed={setNeedAnalysis} />}
      {view === "need-draft" && <NeedDraft go={go} setNeedStep={setNeedStep} analysis={needAnalysis} />}
      {view === "match" && <MatchView go={go} setNeedStep={setNeedStep} />}
      {view === "accept" && <OrderAccepted go={go} />}
      {view === "enterprise" && <EnterpriseView go={go} />}
      {view === "catalog" && <EnterpriseCatalog go={go} />}
      {view === "procure" && <ProcureView step={procureStep} setStep={setProcureStep} go={go} flash={flash} />}
      {view === "consult" && <ConsultView step={consultStep} setStep={setConsultStep} go={go} />}
      {view === "poc" && <PocView go={go} setConsultStep={setConsultStep} />}
      {view === "project" && <EnterpriseProject go={go} />}
      {view === "platform" && <PlatformView go={go} />}
      {view === "admin-login" && <AdminLogin go={go} user={currentUser} openLogin={() => setAuthOpen(true)} />}
      {isAdminView && !canAccessAdmin && <AdminLogin go={go} user={currentUser} openLogin={() => setAuthOpen(true)} />}
      {view === "admin-overview" && canAccessAdmin && <AdminOverview go={go} flash={flash} />}
      {view === "admin-review" && canAccessAdmin && <AdminReview flash={flash} />}
      {view === "admin-reports" && canAccessAdmin && <AdminReports flash={flash} />}
      {view === "admin-contributors" && canAccessAdmin && <AdminContributors flash={flash} />}
      {view === "admin-audit" && canAccessAdmin && <AdminAudit flash={flash} />}
      {view === "admin-config" && canAccessAdmin && <AdminConfig flash={flash} />}
      </section>
      </div>

      <footer><div className="shell footer-inner"><div className="footer-brand"><b>来造</b><span>发现、合作与发布。</span></div><div className="footer-links"><div><b>发现</b><button onClick={()=>jump("official-tools","官方工具")}>官方工具</button><button onClick={()=>jump("explore","作品广场")}>作品广场</button></div><div><b>合作</b><button onClick={()=>jump("enterprise","定制合作")}>定制合作</button><button onClick={()=>jump("profile","创作者主页")}>创作者主页</button></div><div><b>了解</b><button onClick={()=>jump("map","完整路径")}>完整体验路径</button><button onClick={()=>jump("platform","平台规则")}>平台规则</button><button onClick={()=>jump("admin-login","管理员登录")}>管理后台</button></div></div></div></footer>
      <nav className="mobile-nav" aria-label="移动端导航"><button className={view==="home"?"on":""} onClick={()=>jump("home","首页")}><UiIcon name="home" size="small"/>首页</button><button className={view==="explore"?"on":""} onClick={()=>jump("explore","逛作品")}><UiIcon name="search" size="small"/>逛作品</button><button className={view==="wish"?"on":""} onClick={()=>jump("wish","许愿池")}><UiIcon name="idea" size="small"/>许愿池</button><button onClick={()=>setMoreOpen(true)}><UiIcon name="more" size="small"/>更多</button></nav>
      {moreOpen&&<div className="more-mask" onClick={()=>setMoreOpen(false)}><aside className="more-sheet" onClick={e=>e.stopPropagation()}><div><b>更多服务</b><button onClick={()=>setMoreOpen(false)}>×</button></div><button onClick={()=>{jump("create","发布作品");setMoreOpen(false)}}>发布作品 <span>导入并分享外部完成的作品</span></button><button onClick={()=>{jump("orders","接单中心");setMoreOpen(false)}}>创作者接单 <span>查看个人需求与报价</span></button><button onClick={()=>{jump("enterprise","定制合作");setMoreOpen(false)}}>定制合作 <span>找创作者、采购作品或平台定制</span></button><button onClick={()=>{jump("map","路径地图");setMoreOpen(false)}}>完整路径 <span>查看全部产品体验</span></button></aside></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
      {authOpen && <PhoneLoginDialog onClose={() => { setAuthOpen(false); setPendingPurchase(null); }} onLoggedIn={(user) => { setCurrentUser(user); setAuthOpen(false); flash(`欢迎你，${user.display_name}`); if (pendingPurchase) { const item = pendingPurchase; setPendingPurchase(null); setCheckoutItem(item); } }} />}
      {checkoutItem && <PurchaseConfirmDialog item={checkoutItem} onClose={() => setCheckoutItem(null)} onConfirm={() => void createPurchaseOrder(checkoutItem)} />}
    </main>
  );
}

function HomeView({ go }: { go: (v: View, l: string) => void }) {
  return <>
    <section className="next-home"><div className="shell">
      <div className="home-intro"><span>AI 作品发现与合作平台</span><h1>让好作品被使用，<br/>让创作者被看见。</h1></div>
      <div className="product-rules" aria-label="平台规则"><div><b>内容</b><strong>网页 · Skill</strong></div><div><b>使用</b><strong>官方工具站 · 作品页</strong></div><div><b>创作</b><strong>自有 Agent／AI 平台</strong></div></div>
      <div className="command-center"><UiIcon name="search"/><input aria-label="搜索作品" placeholder="搜索一个能直接使用的作品"/><button onClick={()=>go("explore","作品广场")}>发现作品 <span>↗</span></button></div>
      <div className="home-bento">
        <button className="bento-main" onClick={()=>go("work","松弛感旅行规划器")}><div className="bento-visual scene-1"/><div className="bento-copy"><h2>松弛感旅行规划器</h2><footer><em>立即体验 →</em></footer></div></button>
        <button className="bento-idea" onClick={()=>go("mentor","提示词导师")}><UiIcon name="mentor" size="large"/><h2>导师 Agent</h2><b>生成外部提示词 →</b></button>
        <button className="bento-discover" onClick={()=>go("explore","作品广场")}><div><strong>126 个作品</strong></div><div className="mini-stack">{works.slice(0,3).map((w,i)=><i className={`scene-${i+2}`} key={w.id}/>)}</div><b>打开作品广场 →</b></button>
        <button className="bento-request" onClick={()=>go("enterprise","定制合作")}><UiIcon name="document"/><div><h3>定制合作</h3></div><em>→</em></button>
      </div>
    </div></section>
    <section className="home-flow"><div className="shell"><div className="flow-title"><h2>选择完成方式</h2></div><div className="flow-lane">{[["01","直接使用"],["02","外部完成后发布"],["03","生成外部提示词"],["04","找到合作伙伴"]].map((x,i)=><button key={x[0]} onClick={()=>go((["explore","create","mentor","enterprise"] as View[])[i],x[1])}><small>{x[0]}</small><b>{x[1]}</b><em>↗</em></button>)}</div></div></section>
    <section className="home-library"><div className="shell"><div className="library-head"><div><span>为你精选</span><h2>先看结果，再选择工具</h2></div><button onClick={()=>go("explore","作品广场")}>查看全部作品 →</button></div><div className="library-grid">{works.map((w,i)=><button key={w.id} onClick={()=>go("work",w.title)}><div className={`library-cover scene-${i+1}`}><span>{w.type}</span></div><div><h3>{w.title}</h3><footer><span>{w.author}</span><b>{w.price}</b></footer></div></button>)}</div></div></section>
    <section className="home-creators"><div className="shell"><div className="library-head"><div><span>创作者合作</span><h2>找到适合这件事的人</h2></div><button onClick={()=>go("enterprise","定制合作")}>进入合作中心 →</button></div><div className="creator-card-grid">{[["林","林小满","互动 H5 · 网页小游戏 · 数据可视化","4.9 分 · 2 小时响应"],["乔","乔木","旅行工具 · 内容产品 · 轻量网页","4.8 分 · 当前可接单"],["昼","林昼","品牌内容 · 工作流设计 · AI 应用","4.9 分 · 128 次成交"]].map((x,i)=><button key={x[1]} onClick={()=>go(i===0?"profile":"enterprise",i===0?"林小满的主页":"定制合作")}><span>{x[0]}</span><div><small>认证创作者</small><h3>{x[1]}</h3><p>{x[2]}</p><b>{x[3]}</b></div><em>查看主页 →</em></button>)}</div></div></section>
    <section className="home-paths"><div className="shell"><div className="library-head"><div><span>完整体验路径</span><h2>从你现在要做的事开始</h2></div><button onClick={()=>go("map","完整路径")}>查看全部路径 →</button></div><div className="home-path-grid">{paths.slice(0,6).map((p)=><button key={p.title} onClick={()=>go(p.target,p.title)}><span>{p.group}</span><h3>{p.title}</h3><p>{p.desc}</p><b>开始 →</b></button>)}</div></div></section>
  </>;
}

function WishPool({flash,go}:{flash:(s:string)=>void;go:(v:View,l:string)=>void}) {
  const [wish,setWish]=useState("");
  const [saving,setSaving]=useState(false);
  const [wishes,setWishes]=useState<Array<{id:string;title:string;category:string;votes:number}>>([]);
  useEffect(()=>{fetch("/api/wishes").then(r=>r.json()).then(x=>setWishes(x.wishes||[])).catch(()=>{});},[]);
  async function submit(){if(!wish.trim()){flash("请先写下愿望");return;}setSaving(true);try{const r=await fetch("/api/wishes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:wish})});const x=await r.json();if(!r.ok)throw new Error();setWishes(v=>[x.wish,...v]);setWish("");flash("愿望已保存");}catch{flash("保存失败，请稍后再试");}finally{setSaving(false);}}
  async function vote(id:string){const r=await fetch("/api/wishes/vote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});const x=await r.json();if(r.ok)setWishes(v=>v.map(w=>w.id===id?{...w,votes:x.votes}:w));}
  return <Page title="许愿池" eyebrow="大家想要什么" intro=""><div className="wish-composer"><div><h2>我希望有一个……</h2></div><textarea value={wish} onChange={(e)=>setWish(e.target.value)} placeholder="写下场景和结果"/><button className="primary" disabled={saving} onClick={submit}>{saving?"保存中":"提交愿望"}</button></div><div className="wish-head"><h2>正在获得共鸣</h2><button className="secondary" onClick={()=>go("enterprise","定制合作")}>立即定制</button></div><div className="wish-grid">{wishes.map((x)=><article key={x.id}><span>{x.category}</span><h3>{x.title}</h3><footer><button onClick={()=>vote(x.id)}>♡ 我也需要</button><b>{x.votes} 人共鸣</b></footer></article>)}</div></Page>;
}

function PathMap({ go }: { go: (v: View, l: string) => void }) { return <Page title="完整体验路径" eyebrow="INTERACTIVE MAP" intro="从任意角色开始，点击一条路径即可进入对应的产品流程。页面顶部会保留你的当前位置。"><div className="path-grid">{paths.map(p => <button className="path-card" key={p.title} onClick={() => go(p.target, p.title)}><Icon>{p.icon}</Icon><span className="tag">{p.group}</span><h3>{p.title}</h3><p>{p.desc}</p><b>开始体验 →</b></button>)}</div></Page> }

function PhoneLoginDialog({ onClose, onLoggedIn }: { onClose: () => void; onLoggedIn: (user: AppUser) => void }) {
  const [mode,setMode]=useState<"login"|"register">("login"); const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [name,setName]=useState("来造用户"); const [notice,setNotice]=useState("使用账号和密码登录；首次使用请注册账号。"); const [busy,setBusy]=useState(false);
  const valid=/^[A-Za-z0-9_]{3,30}$/.test(username)&&password.length>=10;
  const switchMode=(next:"login"|"register")=>{setMode(next);setNotice(next==="register"?"账号可用字母、数字和下划线；密码至少 10 位。":"使用账号和密码登录；首次使用请注册账号。");};
  const submit=async()=>{if(!valid){setNotice("请填写 3–30 位账号，以及至少 10 位密码后再登录。");return;}try{setBusy(true);const user=mode==="login"?await loginWithPassword(username,password):await registerWithPassword(username,password,name);onLoggedIn(user);}catch(error){setNotice(error instanceof Error?error.message:"操作失败");}finally{setBusy(false);}};
  return <div role="dialog" aria-modal="true" aria-label="账号登录或注册" style={{position:"fixed",inset:0,zIndex:1000,display:"grid",placeItems:"center",padding:20,background:"rgba(8,18,40,.58)"}}><div style={{width:"min(420px,100%)",padding:28,background:"#fff",color:"#17233d",boxShadow:"0 20px 60px rgba(0,0,0,.35)"}}><div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"start"}}><div><span style={{fontSize:12,letterSpacing:".12em",color:"#6b4cf5"}}>LAIZAO ACCOUNT</span><h2 style={{margin:"8px 0"}}>{mode==="login"?"账号登录":"注册账号"}</h2></div><button onClick={onClose} aria-label="关闭">×</button></div><div style={{display:"flex",gap:8,margin:"12px 0 4px"}}><button className={mode==="login"?"primary":"secondary"} onClick={()=>switchMode("login")}>登录</button><button className={mode==="register"?"primary":"secondary"} onClick={()=>switchMode("register")}>注册</button></div><p style={{fontSize:14,color:"#63708a"}}>账号可用字母、数字和下划线；密码至少 10 位。</p><label style={{display:"grid",gap:6,marginTop:16}}>账号<input value={username} onChange={e=>setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g,""))} autoCapitalize="none" maxLength={30} placeholder="例如 laizao_creator"/></label>{mode==="register"&&<label style={{display:"grid",gap:6,marginTop:14}}>昵称<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>}<label style={{display:"grid",gap:6,marginTop:14}}>密码<input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={10} maxLength={128} placeholder="至少 10 位"/></label><p style={{minHeight:20,fontSize:13,color:"#6b4cf5"}}>{notice}</p><button className="primary wide" disabled={busy} onClick={submit}>{busy?"处理中…":mode==="login"?"登录":"创建账号"}</button></div></div>;
}

function PurchaseConfirmDialog({item,onClose,onConfirm}:{item:MarketplaceItem;onClose:()=>void;onConfirm:()=>void}) {
  const price=item.price_cents===0?'免费':`¥${(item.price_cents/100).toFixed(2)}`;
  return <div className="dialog-backdrop" role="presentation"><section className="auth-dialog checkout-dialog" role="dialog" aria-modal="true" aria-label="确认获取作品"><button className="dialog-close" onClick={onClose}>×</button><span className="dialog-kicker">CONFIRM ORDER</span><h2>确认获取作品</h2><div className="checkout-work"><div className="checkout-cover">{item.tags[0]||'作品'}</div><div><b>{item.title}</b><p>{item.description}</p><small>创作者：{item.creator_name}</small></div></div><div className="checkout-total"><span>订单金额</span><b>{price}</b></div><p>确认后会创建订单，再由你主动选择模拟支付成功或失败；不会发生真实扣款。</p><div className="dialog-actions"><button className="secondary" onClick={onClose}>再看看</button><button className="primary" onClick={onConfirm}>确认并去支付</button></div></section></div>;
}

function ExploreViewLegacy({ go, flash, marketplace, onBuy }: { go:(v:View,l:string)=>void; flash:(s:string)=>void; marketplace:MarketplaceItem[]; onBuy:(item:MarketplaceItem)=>void }) { return <div /> }

function ExploreView({go, flash, marketplace, onBuy, onOpen}:{go:(v:View,l:string)=>void;flash:(s:string)=>void;marketplace:MarketplaceItem[];onBuy:(item:MarketplaceItem)=>void;onOpen:(item:MarketplaceItem)=>void}) {
  return <Page title="作品广场" eyebrow="DISCOVER · TRY BEFORE YOU GET" intro="先免费体验作品，再决定是否获取完整版本。">
    <div className="content-heading"><div><h2>本地交易市场</h2><small>审核通过的作品都提供购买前体验</small></div></div>
    <div className="work-grid consumer-grid">
      {marketplace.map((item,i)=><article className="work-card" key={item.listing_id}>
        <button className={`work-cover art-cover scene-${(i%4)+1}`} onClick={()=>onOpen(item)} style={item.cover_url?{backgroundImage:`linear-gradient(rgba(8,18,40,.12),rgba(8,18,40,.18)),url(${item.cover_url})`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}><small>{item.tags[0]||"作品"}</small><em>查看详情</em></button>
        <div className="work-body"><div className="work-title"><h3>{item.title}</h3><span className="verified">可体验</span></div><p>{item.description}</p><div className="author"><span>{item.creator_name.slice(0,1)}</span>{item.creator_name}<i>✓</i></div><div className="work-meta"><b>{item.price_cents===0?"免费":`¥${(item.price_cents/100).toFixed(2)}`}</b><button className="secondary" onClick={()=>onOpen(item)}>免费体验 →</button></div></div>
      </article>)}
    </div>
    {!marketplace.length&&<div className="not-found"><b>暂时没有已上架作品</b><button onClick={()=>go("creator","创作者中心")}>去发布第一个作品 →</button></div>}
  </Page>
}

function MarketplaceDetailView({item,go,onBuy,flash}:{item:MarketplaceItem;go:(v:View,l:string)=>void;onBuy:(item:MarketplaceItem)=>void;flash:(s:string)=>void}) {
  const tryWork=()=>{ void trackWorkTried(item.work_id,item.listing_id); if(!item.trial_url){flash("该作品暂未配置体验链接");return;} window.location.assign(item.trial_url); };
  return <Page title={item.title} eyebrow={`WEB · ${item.tags[0]||"已审核"}`} intro={item.description}>
    <div className="detail-grid"><div className="demo-panel mint" style={item.cover_url?{backgroundImage:`linear-gradient(rgba(232,241,252,.86),rgba(232,241,252,.86)),url(${item.cover_url})`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}><div className="demo-map"><span>免费</span><i/><span>立即</span><i/><span>体验</span></div><div className="demo-note"><b>先试用，再决定是否获取</b><p>体验不会创建订单，也不会占用你的权益。</p></div></div><aside className="detail-side"><div className="creator-line"><span>{item.creator_name.slice(0,1)}</span><div><b>{item.creator_name}</b><small>作品创作者 · 已审核</small></div><button onClick={()=>flash("已关注创作者")}>关注</button></div><div className="metric-row"><span><b>公开</b>免费体验</span><span><b>已审</b>作品状态</span><span><b>{item.price_cents===0?"免费":`¥${(item.price_cents/100).toFixed(2)}`}</b>完整交付</span></div><button className="primary wide" onClick={tryWork}>立即免费体验</button><button className="amber-btn wide" onClick={()=>onBuy(item)}>{item.price_cents===0?"免费获取完整作品":"获取完整作品"}</button><div className="rights"><b>体验与交付</b><p>体验版可直接打开；获取后，网页作品可长期访问，ZIP 作品包可下载。平台管理员默认拥有全部作品的使用权。</p></div><button className="text-btn wide" onClick={()=>go("explore","作品广场")}>返回作品广场</button></aside></div>
  </Page>
}

function OfficialToolsView({go,flash}:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  return <NativeToolsView onExplore={()=>go("explore","作品广场")} onMentor={()=>go("mentor","生成提示词")} onCollab={()=>go("enterprise","定制合作")} flash={flash}/>;
}

function WorkView({ go, saved, setSaved, flash }: { go:(v:View,l:string)=>void; saved:boolean; setSaved:(b:boolean)=>void; flash:(s:string)=>void }) { return <Page title="松弛感旅行规划器" eyebrow="WEB · 稳定可用" intro="根据预算、天数和旅行偏好，生成路线、每日安排与可执行清单。"><div className="detail-grid"><div className="demo-panel mint"><div className="demo-map"><span>昆明</span><i/><span>大理</span><i/><span>沙溪</span><i/><span>丽江</span></div><div className="demo-note"><b>7 天 · 人均 ¥4,600</b><p>少赶路 · 多自然 · 在地餐馆</p></div></div><aside className="detail-side"><div className="creator-line"><span>乔</span><div><b>乔木</b><small>旅行工具创作者 · 已认证</small></div><button onClick={() => flash("已关注乔木")}>关注</button></div><div className="metric-row"><span><b>12.8k</b>有效使用</span><span><b>91%</b>完成率</span><span><b>4.8</b>用户评分</span></div><button className="primary wide" onClick={() => go("experience", "在线体验")}>立即免费体验</button><div className="split-actions"><button className="secondary" onClick={() => { setSaved(!saved); flash(saved ? "已取消收藏" : "已收藏到常用工具"); }}>{saved ? "已收藏" : "收藏长期使用"}</button><button className="secondary" onClick={() => { flash("已保留来源信息，请在自己的 AI 工具中完成改造"); go("mentor", "生成改造提示词"); }}>生成外部改造提示词</button></div><button className="amber-btn wide" onClick={() => go("need", "帮我做同款")}>帮我做一个团队版</button><button className="text-btn wide" onClick={() => go("catalog", "企业采购")}>申请企业采购／授权 →</button><div className="rights"><b>使用与权利</b><p>公开免费使用 · 允许在外部工具中复制改造 · 商用与企业使用需单独授权</p></div></aside></div></Page> }

function ExperienceView({ go, flash }: { go:(v:View,l:string)=>void; flash:(s:string)=>void }) { const [done,setDone]=useState(false); return <Page title="规划一次真正松弛的旅行" eyebrow="LIVE EXPERIENCE" intro="输入很少的信息，先得到可用结果；不够合适时，再做一个自己的版本。"><div className="experience-grid"><div className="form-card"><label>去哪里<input defaultValue="云南"/></label><div className="two"><label>旅行天数<select defaultValue="7"><option>5</option><option>7</option><option>10</option></select></label><label>人均预算<input defaultValue="5000"/></label></div><label>更在意什么<div className="chips"><button className="on">自然</button><button>人文</button><button className="on">少赶路</button><button>美食</button></div></label><div className="cost"><span>本次预计消耗</span><b>0 Token</b></div><button className="primary wide" onClick={()=>setDone(true)}>生成旅行计划</button></div><div className={`result-card ${done ? "show" : ""}`}>{done ? <><span className="success">✓ 已生成 · 2.1 秒</span><h3>昆明 → 大理 → 沙溪 → 丽江</h3><div className="timeline"><div><b>D1–2</b><span>昆明 · 菜市场与湿地</span></div><div><b>D3–4</b><span>大理 · 洱海西岸慢行</span></div><div><b>D5</b><span>沙溪 · 古镇住一晚</span></div><div><b>D6–7</b><span>丽江 · 雪山与返程</span></div></div><div className="result-actions"><button onClick={()=>flash("配置与结果已保存，下次可继续使用")}>保存为我的行程</button><button onClick={()=>go("need","定制团队版")}>需要团队协作版</button></div></> : <div className="empty-state"><Icon>↗</Icon><b>结果会出现在这里</b><span>这是一条长期使用者路径：保存配置后，可以从“最近使用”快速回来。</span></div>}</div></div></Page> }

function SquishyTrialView({go}:{go:(v:View,l:string)=>void}) { const [pressed,setPressed]=useState(false); const [count,setCount]=useState(0); const colors=["#ff8eaa","#9e89ff","#63c8b7","#ffbb58"]; const color=colors[count%colors.length]; return <Page title="解压捏捏乐" eyebrow="FREE EXPERIENCE · WEB" intro="按住软胶球，感受轻微回弹。体验版无需登录，也不会创建订单。"><div className="experience-grid"><section className="form-card"><span className="tag">免费体验</span><h2>捏掉一点紧绷</h2><p>按住中央软胶球，让它慢慢缩小；松开后会回弹。</p><div className="cost"><span>本次体验</span><b>0 元</b></div><button className="secondary wide" onClick={()=>go("explore","作品广场")}>返回作品详情</button></section><section className="result-card show" style={{display:"grid",placeItems:"center",minHeight:420,background:"#fff7f9"}}><button aria-label="按住捏捏乐" onMouseDown={()=>{setPressed(true);setCount(x=>x+1)}} onMouseUp={()=>setPressed(false)} onMouseLeave={()=>setPressed(false)} onTouchStart={()=>{setPressed(true);setCount(x=>x+1)}} onTouchEnd={()=>setPressed(false)} style={{width:pressed?170:230,height:pressed?170:230,borderRadius:"50%",border:"8px solid rgba(255,255,255,.7)",background:color,boxShadow:pressed?"inset 0 15px 28px rgba(0,0,0,.18)":"0 24px 44px rgba(255,110,145,.32)",transition:"all .18s ease",fontSize:48,cursor:"pointer"}}>●</button><p style={{margin:0,color:"#66728a"}}>已捏 {count} 次 · {pressed?"正在回弹…":"按住试试"}</p></section></div></Page> }

function EntitlementsView({ flash }: { flash:(s:string)=>void }) {
  const [items,setItems]=useState<OwnedWork[]>([]); const [loading,setLoading]=useState(true); const [history,setHistory]=useState<{item:OwnedWork;versions:WorkVersionHistory[]}|null>(null);
  const refresh=()=>{setLoading(true);getEntitlements().then(setItems).catch((e:Error)=>flash(e.message)).finally(()=>setLoading(false));};
  const open=(sourceUrl:string)=>{openOwnedSource(sourceUrl).catch((e:Error)=>flash(e.message));};
  const showHistory=async(item:OwnedWork)=>{try{setHistory({item,versions:await getWorkVersions(item.work_id)});}catch(e){flash(e instanceof Error?e.message:'读取版本记录失败');}};
  const upgrade=async()=>{if(!history)return;try{await upgradeOwnedWork(history.item.work_id);flash('已升级到最新版本');setHistory(null);refresh();}catch(e){flash(e instanceof Error?e.message:'升级失败');}};
  useEffect(() => { void refresh(); }, []);
  return <Page title="我的权益" eyebrow="MY LIBRARY" intro="支付完成后，已获得的作品会保存在这里。"><div className="content-heading"><div><h2>{loading?'正在读取…':`已获得 ${items.length} 个作品`}</h2></div><button className="secondary" onClick={refresh}>刷新</button></div>{items.length===0&&!loading?<div className="empty-state"><b>还没有获得作品</b><span>去作品广场找到适合你的工具吧。</span></div>:<div className="work-grid consumer-grid">{items.map((item,i)=><article className="work-card" key={item.entitlement_id}><div className={`work-cover art-cover scene-${(i%4)+1}`}><small>v{item.version_number}</small><em>权益生效</em></div><div className="work-body"><h3>{item.title}</h3><p>{item.description}</p><div className="work-meta"><span>{item.version_number<item.latest_version_number?`可升级至 v${item.latest_version_number}`:`v${item.version_number} 已是最新`}</span><button className="secondary" onClick={()=>open(item.source_url)}>{item.source_url.includes('/v1/files/')?'下载作品 →':'打开作品 →'}</button></div><button className="text-btn" onClick={()=>showHistory(item)}>查看版本记录</button></div></article>)}</div>}{history&&<div className="dialog-backdrop"><section className="auth-dialog"><button className="dialog-close" onClick={()=>setHistory(null)}>×</button><span className="dialog-kicker">VERSION HISTORY</span><h2>{history.item.title}</h2>{history.versions.map(v=><div className="version-history-row" key={v.id}><b>v{v.version_number}{v.is_owned_version?' · 当前拥有版本':v.is_latest?' · 最新版本':''}</b><span>{v.changelog||'未填写更新说明'}</span><small>{new Date(v.created_at).toLocaleString()}</small></div>)}{history.item.version_number<history.item.latest_version_number&&<button className="primary wide" onClick={upgrade}>升级到最新版本</button>}</section></div>}</Page>;
}

function MyOrdersView({ flash }: { flash:(s:string)=>void }) {
  const [orders,setOrders]=useState<MyOrder[]>([]); const [loading,setLoading]=useState(true); const [working,setWorking]=useState<string|null>(null); const [offline,setOffline]=useState<{order:MyOrder;info:OfflinePaymentInfo}|null>(null); const [proof,setProof]=useState<File|null>(null); const [note,setNote]=useState("");
  const refresh=()=>{setLoading(true);getMyOrders().then(setOrders).catch((e:Error)=>flash(e.message)).finally(()=>setLoading(false));};
  const act=async(order:MyOrder,action:"success"|"failed"|"refund")=>{try{setWorking(order.order_id);if(action==='success')await simulatePaymentSuccess(order.order_id);if(action==='failed')await simulatePaymentFailed(order.order_id);if(action==='refund')await simulateRefund(order.order_id);flash(action==='success'?'模拟支付成功，作品已交付':action==='failed'?'已模拟支付失败，可再次支付':'退款完成，权益已撤销');refresh();}catch(e){flash(e instanceof Error?e.message:'订单操作失败');}finally{setWorking(null);}};
  const openOffline=async(order:MyOrder)=>{try{setWorking(order.order_id);if(order.amount_cents===0){await simulatePaymentSuccess(order.order_id);flash('免费作品已直接交付到我的权益');refresh();return;}const info=await getOfflinePaymentInfo(order.order_id);setOffline({order,info});}catch(e){flash(e instanceof Error?e.message:'暂无法获取收款信息');}finally{setWorking(null);}};
  const submitProof=async()=>{if(!offline||!proof){flash('请上传付款凭证截图');return;}try{setWorking(offline.order.order_id);const uploaded=await uploadCoverImage(proof);await submitPaymentProof(offline.order.order_id,uploaded.source_url,note);setOffline(null);setProof(null);setNote('');flash('凭证已提交，等待管理员核验后交付作品');refresh();}catch(e){flash(e instanceof Error?e.message:'提交失败');}finally{setWorking(null);}};
  const label=(status:string)=>({created:'待付款',payment_failed:'付款失败',payment_submitted:'待人工核验',paid:'已支付',delivered:'已交付',refunded:'已退款',cancelled:'已取消'}[status]||status);
  useEffect(() => { void refresh(); }, []);
  return <Page title="我的订单" eyebrow="MY ORDERS" intro="付费作品采用线下扫码付款，提交凭证后由管理员核验；免费作品可直接获取。"><div className="content-heading"><div><h2>{loading?'正在读取…':`共 ${orders.length} 笔订单`}</h2></div><button className="secondary" onClick={refresh}>刷新</button></div>{orders.length===0&&!loading?<div className="empty-state"><b>还没有订单</b><span>购买作品后，订单会出现在这里。</span></div>:<section className="admin-card"><div className="admin-table-head"><span>作品</span><span>金额</span><span>状态</span><span>下单时间</span><span>操作</span></div>{orders.map(order=><div className="admin-table-row" key={order.order_id}><b>{order.title}</b><span>{order.amount_cents===0?'免费':`¥${(order.amount_cents/100).toFixed(2)}`}</span><span className={order.status==='delivered'?'status-green':order.status==='refunded'||order.status==='payment_failed'?'status-red':'status-soft'}>{label(order.status)}</span><span>{new Date(order.created_at).toLocaleString()}</span><span className="order-actions">{(order.status==='created'||order.status==='payment_failed')&&<button className="primary" disabled={working===order.order_id} onClick={()=>openOffline(order)}>{order.amount_cents===0?'免费获取':'扫码付款'}</button>}{order.status==='payment_submitted'&&<small>凭证已提交，等待核验</small>}{order.status==='delivered'&&<button className="danger" disabled={working===order.order_id} onClick={()=>act(order,'refund')}>模拟退款</button>}{order.status==='refunded'&&<small>{order.refunded_at?`退款：${new Date(order.refunded_at).toLocaleString()}`:'已退款'}</small>}</span></div>)}</section>}{offline&&<div className="dialog-backdrop"><section className="auth-dialog"><button className="dialog-close" onClick={()=>setOffline(null)}>×</button><span className="dialog-kicker">OFFLINE PAYMENT · BETA</span><h2>扫码付款</h2><p>请向创作者「{offline.info.creator_name}」支付 <b>{offline.info.amount_cents===0?'免费':`¥${(offline.info.amount_cents/100).toFixed(2)}`}</b>。平台不托管资金，付款后需提交凭证等待人工核验。</p><img src={offline.info.qr_url} alt="创作者收款二维码" style={{width:220,height:220,objectFit:'contain',border:'1px solid #dce3ef',margin:'8px auto',display:'block'}}/><label>付款凭证截图（PNG/JPG/WebP，≤5MB）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setProof(e.target.files?.[0]||null)}/></label><label>备注（可选）<input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="例如付款时间、付款账号尾号"/></label><div className="dialog-actions"><button className="secondary" onClick={()=>setOffline(null)}>取消</button><button className="primary" disabled={working===offline.order.order_id||!proof} onClick={submitProof}>{working===offline.order.order_id?'提交中…':'提交付款凭证'}</button></div></section></div>}</Page>;
}

function CreatorView({ go, flash }:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  const [dashboard,setDashboard]=useState<CreatorDashboard|null>(null); const [error,setError]=useState(""); const [editing,setEditing]=useState<MyWork|null>(null); const [releasing,setReleasing]=useState<MyWork|null>(null); const [qrOpen,setQrOpen]=useState(false);
  const refresh=()=>{getCreatorDashboard().then(data=>{setDashboard(data);setError("");}).catch((e:Error)=>setError(e.message));};
  useEffect(() => { void refresh(); }, []);
  const data=dashboard; const status=(value:string)=>value==='approved'?'已上架':value==='pending'?'待审核':value==='rejected'?'已驳回':'草稿';
  const archive=async(work:MyWork)=>{if(!window.confirm(`确认下架「${work.title}」吗？下架后不再在作品广场展示。`))return;try{await archiveWork(work.work_id);flash('作品已下架');refresh();}catch(e){flash(e instanceof Error?e.message:'下架失败');}};
  const deploy=async(work:MyWork)=>{try{const result=await deployStaticWork(work.work_id);flash(result.message);refresh();}catch(e){flash(e instanceof Error?e.message:'静态部署失败');}};
  return <Page title="创作者中心" eyebrow="创作与经营" intro="">
    <div className="dashboard-head"><div><span>累计模拟收入</span><b>¥ {(data?.total_revenue_cents||0)/100}</b><small>{data?.paid_order_count||0} 笔已交付订单</small></div><div><span>我的作品</span><b>{data?.works.length||0}</b><small>包含草稿与审核状态</small></div><div><span>待审核事项</span><b>{data?.pending_review_count||0}</b><small>管理员审核后会上架</small></div></div>
    {error?<div className="empty-state"><b>{error}</b><span>请先登录账号后，再管理和发布作品。</span></div>:<>
      <div className="big-choice creator-tool-grid"><button onClick={()=>go("create","发布作品")}><Icon>造</Icon><h3>发布网页或 Skill</h3><b>开始发布 →</b></button><button onClick={()=>go("orders","接单中心")}><Icon>接</Icon><h3>承接个人需求</h3><b>进入接单中心 →</b></button><button onClick={()=>go("mentor","提示词工具")}><Icon>↗</Icon><h3>生成外部提示词</h3><b>打开提示词工具 →</b></button></div>
      <section className="creator-account-actions"><div><span>购买与交付</span><h2>我的权益</h2><p>查看已获得的作品，并打开网页或下载作品包。</p><button className="secondary" onClick={()=>go("entitlements","我的权益")}>查看我的权益 →</button></div><div><span>购买与交付</span><h2>我的订单</h2><p>查看交易金额、支付时间和交付状态。</p><button className="secondary" onClick={()=>go("my-orders","我的订单")}>查看我的订单 →</button></div></section>
      <div className="content-heading"><div><h2>我的作品</h2><p>编辑后会重新进入审核；下架后将不再公开展示。</p></div><div><button className="secondary" onClick={()=>setQrOpen(true)}>设置线下收款码</button><button className="secondary" onClick={refresh}>刷新</button></div></div>
      <section className="admin-card">{(data?.works||[]).map(work=><div className="admin-table-row" key={work.work_id}><b>{work.title}</b><span className={work.review_status==='rejected'?'status-red':work.review_status==='approved'?'status-green':'status-soft'}>{status(work.review_status)}</span><span>{work.price_cents===null?'未定价':work.price_cents===0?'免费':`¥${(work.price_cents/100).toFixed(2)}`}</span><span>{work.deployment_status==='ready'?'体验已部署':work.deployment_status==='failed'?`部署失败：${work.deployment_error}`:work.review_note||'等待审核'}</span><span><button className="secondary" onClick={()=>setEditing(work)}>编辑</button><button className="secondary" onClick={()=>setReleasing(work)}>更新版本</button><button className="secondary" onClick={()=>deploy(work)}>{work.deployment_status==='ready'?'重新部署体验版':'部署体验版'}</button>{work.listing_status!=="archived"&&<button className="danger" onClick={()=>archive(work)}>下架</button>}</span></div>)}{data&&!data.works.length&&<p>尚未发布作品。</p>}</section>
      <div className="content-heading"><div><h2>最近成交</h2></div></div><section className="admin-card">{(data?.recent_sales||[]).map(sale=><div className="admin-table-row" key={sale.order_id}><b>{sale.title}</b><span>¥{(sale.amount_cents/100).toFixed(2)}</span><span className="status-green">{sale.status==='delivered'?'已交付':sale.status}</span><span>{sale.paid_at?new Date(sale.paid_at).toLocaleString():'待支付'}</span></div>)}{data&&!data.recent_sales.length&&<p>还没有成交订单。</p>}</section>
      {editing&&<CreatorWorkEditor work={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);refresh();}} flash={flash}/>} {releasing&&<VersionReleaseDialog work={releasing} onClose={()=>setReleasing(null)} onSaved={()=>{setReleasing(null);refresh();}} flash={flash}/>} {qrOpen&&<PaymentQrDialog onClose={()=>setQrOpen(false)} flash={flash}/>}</>
    }
  </Page>;
}

function PaymentQrDialog({onClose,flash}:{onClose:()=>void;flash:(s:string)=>void}) { const [file,setFile]=useState<File|null>(null); const [saving,setSaving]=useState(false); const save=async()=>{if(!file){flash('请先选择收款二维码图片');return;}try{setSaving(true);const uploaded=await uploadCoverImage(file);await savePaymentQr(uploaded.source_url);flash('收款码已保存；内测订单将由买家扫码后提交凭证');onClose();}catch(e){flash(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}}; return <div className="dialog-backdrop"><section className="auth-dialog"><button className="dialog-close" onClick={onClose}>×</button><span className="dialog-kicker">OFFLINE PAYMENT · BETA</span><h2>设置线下收款码</h2><p>仅用于封闭内测的线下付款指引。买家付款后仍需上传凭证，管理员核验后才会交付作品。</p><label>上传二维码图片（PNG/JPG/WebP，≤5MB）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><div className="dialog-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={saving||!file} onClick={save}>{saving?'保存中…':'保存收款码'}</button></div></section></div>; }

function CreatorWorkEditor({work,onClose,onSaved,flash}:{work:MyWork;onClose:()=>void;onSaved:()=>void;flash:(s:string)=>void}) {
  const [title,setTitle]=useState(work.title); const [description,setDescription]=useState(work.description); const [tags,setTags]=useState(work.tags); const [coverUrl,setCoverUrl]=useState(work.cover_url||""); const [trialUrl,setTrialUrl]=useState(work.trial_url||""); const [priceYuan,setPriceYuan]=useState(String((work.price_cents||0)/100)); const [coverFile,setCoverFile]=useState<File|null>(null); const [saving,setSaving]=useState(false);
  const save=async()=>{const price=Number(priceYuan);if(!title.trim()||!trialUrl.trim()||!Number.isFinite(price)||price<0){flash('请填写作品名称、体验链接和正确价格');return;}try{setSaving(true);const uploaded=coverFile?await uploadCoverImage(coverFile):null;await updateWork(work.work_id,{title:title.trim(),description:description.trim(),tags:tags.split(/[,，]/).map(x=>x.trim()).filter(Boolean),coverUrl:uploaded?.source_url||coverUrl.trim(),trialUrl:trialUrl.trim(),priceCents:Math.round(price*100)});flash('已保存并重新提交审核');onSaved();}catch(e){flash(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}};
  return <div className="dialog-backdrop" role="presentation"><section className="auth-dialog" role="dialog" aria-modal="true" aria-label="编辑作品"><button className="dialog-close" onClick={onClose}>×</button><span className="dialog-kicker">EDIT WORK</span><h2>编辑作品</h2><p>修改后的作品会暂时从广场撤下，等待管理员重新审核。</p><label>作品标题<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/></label><label>作品简介<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={10000}/></label><label>标签（用逗号分隔）<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="AI, 网页工具"/></label><label>购买前体验链接（所有访客可打开）<input value={trialUrl} onChange={e=>setTrialUrl(e.target.value)} placeholder="https://体验版网页地址"/></label><div className="two"><label>价格（元）<input type="number" min="0" step="0.01" value={priceYuan} onChange={e=>setPriceYuan(e.target.value)}/></label><label>封面图片（PNG/JPG/WebP，≤5MB）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/></label></div><label>或填写封面图片链接<input value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} placeholder="https://…"/></label>{coverFile&&<small>将上传：{coverFile.name}</small>}<div className="dialog-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={saving} onClick={save}>{saving?'保存中…':'保存并提交审核'}</button></div></section></div>;
}

function VersionReleaseDialog({work,onClose,onSaved,flash}:{work:MyWork;onClose:()=>void;onSaved:()=>void;flash:(s:string)=>void}) {
  const [sourceUrl,setSourceUrl]=useState(""); const [changelog,setChangelog]=useState(""); const [saving,setSaving]=useState(false);
  const release=async()=>{if(!sourceUrl.trim()){flash('请填写新版网页链接或 ZIP 下载链接');return;}try{setSaving(true);await releaseWorkVersion(work.work_id,sourceUrl.trim(),changelog.trim());flash('新版已提交审核，通过后买家可升级');onSaved();}catch(e){flash(e instanceof Error?e.message:'提交新版失败');}finally{setSaving(false);}};
  return <div className="dialog-backdrop"><section className="auth-dialog"><button className="dialog-close" onClick={onClose}>×</button><span className="dialog-kicker">RELEASE VERSION</span><h2>更新「{work.title}」</h2><p>已购买用户继续保留旧版本；审核通过后，他们可在“我的权益”中查看更新并升级。</p><label>新版作品链接<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://…"/></label><label>更新说明<textarea value={changelog} onChange={e=>setChangelog(e.target.value)} placeholder="例如：修复登录问题，新增导出功能"/></label><div className="dialog-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={saving} onClick={release}>{saving?'提交中…':'提交新版审核'}</button></div></section></div>;
}

function CreatorProfileView({go,flash}:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  const services=[['互动 H5／营销页','抽奖、集卡、邀请函、活动落地页','¥800 起'],['网页小游戏','解谜、跳跃、品牌互动玩法','¥1,500 起'],['数据看板','榜单、趋势与表格导入','¥1,200 起'],['AI 实用工具','生成器、问答与知识库应用','¥2,000 起']];
  const archives=[['操作日志','30 条','保留 180 天'],['举报记录','1 条','保留 180 天'],['工具使用记录','9 条','保留 180 天'],['企业咨询线索','1 条','保留 365 天'],['AI 行程记录','8 条','保留 180 天']];
  return <Page title="林小满" eyebrow="VERIFIED CREATOR" intro="AI 网页与小游戏创作者 · 擅长互动 H5、数据可视化、AI 工具"><div className="profile-command"><div className="profile-avatar">林</div><div><span className="verified-pill">✓ 认证创作者</span><div className="profile-tags"><span>互动网页</span><span>小游戏</span><span>AI 工具</span><span>数据可视化</span></div></div><div className="profile-actions"><button className="secondary" onClick={()=>flash("主页编辑已打开")}>编辑主页</button><button className="primary" onClick={()=>go("create","发布作品")}>发布作品</button></div></div><div className="profile-metrics-next"><div><b>36</b><span>上架作品</span></div><div><b>4.9</b><span>好评分</span></div><div><b>128</b><span>已成交</span></div><div><b>2 小时</b><span>平均响应</span></div><div className="available"><b>当前可接单</b><span>互动网页与数据项目</span></div></div><div className="profile-columns"><div className="profile-main-next"><section className="profile-panel"><h2>关于林小满</h2><p>前互联网产品经理，持续创作可点、可玩、可用的网页作品。擅长把模糊想法整理成互动 H5、小游戏、数据看板与实用工具。</p><div className="profile-facts"><span>上海</span><span>入驻 8 个月</span><span>中文／English</span></div></section><section className="profile-panel"><h2>可提供的服务</h2><div className="service-list">{services.map(x=><div key={x[0]}><div><b>{x[0]}</b><span>{x[1]}</span></div><strong>{x[2]}</strong></div>)}</div><button className="primary" onClick={()=>go("need","找林小满定制")}>找 TA 定制</button></section><section className="profile-panel"><div className="panel-title"><h2>作品货架</h2><span>36 件作品</span></div><div className="profile-work-grid">{works.slice(0,3).map((w,i)=><button key={w.id} onClick={()=>go("work",w.title)}><i className={`scene-${i+1}`}/><b>{i===0?'高考志愿智能填报模拟器':i===1?'AI 塔罗牌占卜':w.title}</b><span>{i===0?'¥19.9 起':w.price}</span></button>)}</div></section></div><aside className="profile-side-next"><section className="profile-panel"><h2>买家评价</h2><b className="rating">4.9 <span>112 条真实成交评价</span></b><blockquote>“沟通直接，两天完成活动页，交付比预期更清楚。”</blockquote><blockquote>“数据看板结构专业，团队很快就能开始使用。”</blockquote><button className="secondary wide" onClick={()=>flash("已打开全部评价")}>查看全部评价</button></section><section className="profile-panel"><h2>联系方式</h2><p>填写后，正在寻找创作者的用户可以联系你。</p><button className="secondary wide" onClick={()=>flash("联系方式编辑已打开")}>完善联系方式</button></section></aside></div><section className="profile-panel private-panel"><div className="panel-title"><div><span className="private-tag">仅本人可见</span><h2>合规与归档</h2></div><button className="secondary" onClick={()=>flash("归档清单已导出")}>导出归档清单</button></div><div className="archive-list">{archives.map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><span>{x[2]}</span><em>全部在保留期内</em><button onClick={()=>flash(`${x[0]}已导出为 JSONL`)}>导出 JSONL</button></div>)}</div></section></Page>
}

function CreateView({ step,setStep,selected,choose,workFile,setWorkFile,coverFile,setCoverFile,go,flash }:{step:number;setStep:(n:number)=>void;selected:any;choose:(k:any,v:string)=>void;workFile:File|null;setWorkFile:(file:File|null)=>void;coverFile:File|null;setCoverFile:(file:File|null)=>void;go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  const sections = [
    <div key="m" className="choice-wrap"><h2>填写作品信息</h2><div className="setting-list"><label className="setting"><span>作品标题</span><input value={selected.title} onChange={e=>choose("title",e.target.value)} placeholder="例如：AI 旅行规划器" maxLength={120}/></label><label className="setting"><span>作品简介</span><textarea value={selected.description} onChange={e=>choose("description",e.target.value)} placeholder="用一句话说明它解决什么问题" maxLength={10000}/></label><label className="setting"><span>标签</span><input value={selected.tags} onChange={e=>choose("tags",e.target.value)} placeholder="例如：网页, AI, 旅行"/><small>用逗号分隔，最多 10 个。</small></label><label className="setting"><span>封面图链接（可选）</span><input value={selected.coverUrl} onChange={e=>choose("coverUrl",e.target.value)} placeholder="https://图片地址" inputMode="url"/><small>现在可填写图片 URL；以后可换成 COS 上传后的地址。</small></label></div><Choice title="作品如何进入来造？" sub="" value={selected.method} options={[{v:"导入文件",d:"ZIP 作品包，最大 100MB"},{v:"填写链接",d:"可访问网址"}]} onChoose={v=>choose("method",v)}/>{selected.method==="填写链接"&&<label style={{display:"grid",gap:8,marginTop:18}}><b>作品访问链接（也是免费体验链接）</b><input value={selected.sourceUrl} onChange={e=>choose("sourceUrl",e.target.value)} placeholder="https://你的网页地址" inputMode="url"/><small>所有用户会先从这里体验；购买后才获得完整使用权。</small></label>}{selected.method==="导入文件"&&<><label style={{display:"grid",gap:8,marginTop:18}}><b>上传 ZIP 作品包</b><input type="file" accept=".zip,application/zip" onChange={e=>setWorkFile(e.target.files?.[0]||null)}/><small>{workFile?`已选择：${workFile.name}（${(workFile.size/1024/1024).toFixed(2)}MB）`:'仅接受 ZIP，不会解压或执行其中内容。'}</small></label><div className="review-box" style={{marginTop:18}}><span>自动部署体验版</span><b>提交后将安全检查并生成站内体验链接</b><small>仅支持根目录含 index.html 的纯前端 ZIP；不会执行 Node、Python 或数据库代码。</small></div></>}</div>,
    <div key="cover" className="choice-wrap"><h2>上传封面图（可选）</h2><p>支持 PNG、JPG、WebP，最大 5MB；不上传时可继续使用第一步的封面链接。</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/>{coverFile&&<p>已选择：{coverFile.name}（{(coverFile.size/1024/1024).toFixed(2)}MB）</p>}</div>,
    <Choice key="f" title="要发布什么形式？" sub="" value={selected.format} options={[{v:"网页",d:"网页文件或网址"},{v:"Skill",d:"配置与使用说明"}]} onChoose={v=>choose("format",v)}/>,
    <Choice key="d" title="作品最终去哪里？" sub="同一个作品可以先私用，准备好后再公开。" value={selected.destination} options={[{v:"自己在站内使用",d:"默认私有，可邀请指定用户"},{v:"自己在站外使用",d:"直接导出，由外部环境管理权限"},{v:"站内分享",d:"公开访问，进入审核与分级"}]} onChoose={v=>choose("destination",v)}/>,
    <div key="p" className="choice-wrap"><h2>设置访问、复用和价格</h2><p>公开可用不等于放弃版权。复制、修改和商用权仍由创作者决定。</p><div className="setting-list"><Setting title="访问范围" value={selected.access} options={["仅自己","指定用户","公开"]} onChange={v=>choose("access",v)}/><Setting title="复制并改造" value="允许，保留来源" options={["不允许","允许，保留来源"]}/><Setting title="商业使用" value="需要单独授权" options={["不允许","需要单独授权","允许"]}/><label className="setting"><span>价格（元）</span><input value={selected.priceYuan} onChange={e=>choose("priceYuan",e.target.value)} inputMode="decimal" placeholder="0 表示免费"/><small>例如 9.9；填写 0 为免费。</small></label><label className="toggle-row"><span><b>授权平台分析私有内容</b><small>用于标签与相似内容匹配，可随时撤回</small></span><input type="checkbox"/></label></div></div>,
    <div key="r" className="choice-wrap"><h2>确认并提交</h2><p>站内发布或交付会先进入草稿箱，再由平台审核与分级。</p><div className="summary"><Summary label="作品来源" value={selected.method}/><Summary label="免费体验链接" value={selected.method==="填写链接"?(selected.sourceUrl||"尚未填写"):"提交后自动部署生成"}/><Summary label="作品形态" value={selected.format}/><Summary label="使用去向" value={selected.destination}/><Summary label="访问权限" value={selected.access}/><Summary label="收费" value={selected.pricing}/></div><div className="review-box"><span>平台预检</span><b>未发现明显风险</b><small>提交后将检查运行、版权、隐私、成本和内容质量</small></div></div>
  ];
  return <Page title="导入并发布作品" eyebrow="PUBLISHING FLOW" intro="作品在外部完成；来造负责导入、审核、发布和交易。"><div className="flow-card">{sections[step]}<div className="flow-actions">{step>0 && <button className="secondary" onClick={()=>setStep(step-1)}>上一步</button>}<button className="primary" onClick={()=>{if(step<sections.length-1){setStep(step+1);flash("选择已保存到草稿");}else{go("publish","提交成功");}}}>{step<sections.length-1?"继续":"提交审核"}</button></div></div></Page>
}

function PublishSuccess({go,selected,onPublish}:{go:(v:View,l:string)=>void;selected:any;onPublish:()=>Promise<void>}) { const [publishing,setPublishing]=useState(false); const submit=async()=>{setPublishing(true);try{await onPublish();}finally{setPublishing(false);}}; return <Page title="确认提交作品审核" eyebrow="READY TO SUBMIT" intro="点击确认后才会真正创建作品，并进入管理员审核队列。"><div className="success-panel"><Icon>✓</Icon><h2>「{selected.title || "未命名作品"}」已准备完成</h2><p>{selected.format} · {selected.destination} · {selected.access} · {selected.pricing}</p><div className="status-line"><span className="done">草稿完成</span><i/><span className="on">等待确认提交</span><i/><span>平台审核</span><i/><span>正式发布</span></div><div className="success-actions"><button className="primary" disabled={publishing} onClick={submit}>{publishing ? "正在提交…" : "确认提交审核"}</button><button className="secondary" onClick={()=>go("creator","创作者中心")}>暂不提交，返回创作者中心</button><button className="secondary" onClick={()=>go("platform","平台治理")}>查看平台如何审核</button></div></div></Page> }

function OrderMarket({go}:{go:(v:View,l:string)=>void}) { return <Page title="接单中心" eyebrow="ORDER MARKET" intro="先看清需求、收益和风险，再决定是否投入。MVP 采用“提交方案和报价，由需求方选择”。"><div className="order-layout"><aside className="filters"><b>筛选需求</b><label>作品类型<select><option>全部类型</option><option>网页</option><option>Skill</option><option>Agent</option></select></label><label>预算<select><option>不限预算</option><option>¥500–1000</option><option>¥1000–5000</option></select></label><label className="check"><input type="checkbox" defaultChecked/> 仅看资金已托管</label><label className="check"><input type="checkbox"/> 仅看高匹配</label></aside><div className="order-list">{[{t:"旅行社团队行程协作工具",price:"¥1,500–2,500",tag:"网页 · 7天",match:"92%"},{t:"品牌周报自动整理 Skill",price:"¥800–1,200",tag:"Skill · 5天",match:"86%"},{t:"门店客服知识问答 Agent",price:"¥3,000–5,000",tag:"Agent · 14天",match:"78%"}].map((o,i)=><button key={o.t} className="order-row" onClick={()=>i===0&&go("demand-detail",o.t)}><span className="match">匹配 {o.match}</span><h3>{o.t}</h3><p>需要一个可真实使用、便于团队协作的交付版本，已有参考作品。</p><div><b>{o.price}</b><span>{o.tag}</span><span>预算已托管</span><span>{i+3} 人申请</span></div></button>)}</div></div></Page> }

function DemandDetail({go}:{go:(v:View,l:string)=>void}) { return <Page title="旅行社团队行程协作工具" eyebrow="DEMAND · 92% MATCH" intro="基于现有旅行规划器，增加多人协作、客户确认和方案导出。"><div className="detail-grid"><div className="requirement"><InfoBlock title="需求目标" text="顾问生成初稿后，团队可共同编辑，客户能通过链接确认版本。"/><InfoBlock title="必须交付" text="可运行网页、3 个角色权限、版本记录、PDF 导出与使用说明。"/><InfoBlock title="验收标准" text="10 人同时编辑；历史版本可回退；导出格式完整；基础测试通过。"/><div className="three"><Mini label="预算" value="¥1,500–2,500"/><Mini label="交付" value="7 天"/><Mini label="修改" value="2 次"/></div><InfoBlock title="资料与权属" text="需求方提供品牌素材；交付后归需求方使用，创作者经授权可展示脱敏案例。"/></div><aside className="assessment"><h3>接单参考</h3><div className="score">92<small>% 匹配</small></div><ul><li>✓ 你有 3 个相关网页作品</li><li>✓ 预计 16–20 小时</li><li>✓ 预计 Token 成本 ¥72</li><li>! 客户确认流程需进一步澄清</li></ul><div className="income"><span>预计到手</span><b>¥1,968</b><small>按报价 ¥2,200 估算</small></div><button className="primary wide" onClick={()=>go("quote","提交方案和报价")}>我想承接</button><button className="text-btn wide">先向需求方提问</button></aside></div></Page> }

function QuoteView({go}:{go:(v:View,l:string)=>void}) { return <Page title="提交方案和报价" eyebrow="PROPOSAL" intro="把做法、边界、价格和时间讲清楚。需求方选择后，双方再确认订单。"><div className="proposal"><label>你的方案<textarea defaultValue="基于现有旅行规划器进行团队版改造。先完成角色和协作原型，再接入导出与版本记录。"/></label><div className="two"><label>报价<input defaultValue="2200"/></label><label>交付周期<select><option>7 天</option><option>10 天</option></select></label></div><label>计划拆分<div className="milestones"><span><b>第 1–2 天</b>需求确认与原型</span><span><b>第 3–5 天</b>功能制作与测试</span><span><b>第 6–7 天</b>修改与交付</span></div></label><div className="cost-break"><span>需求方支付<b>¥2,200</b></span><i>−</i><span>成本与服务费<b>¥232</b></span><i>=</i><span>预计到手<b>¥1,968</b></span></div><button className="primary" onClick={()=>go("workspace","订单工作台")}>提交并模拟需求方选择</button></div></Page> }

function OrderWorkspace({go,flash}:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) { const [delivered,setDelivered]=useState(false); return <Page title="订单工作台" eyebrow="IN PROGRESS · 还剩 4 天" intro="作品在外部完成后回到这里提交；范围、价格或期限变化必须形成正式变更。"><div className="workspace"><aside><b>订单进度</b>{["条款确认","预算托管","外部制作","提交验收","结算"].map((x,i)=><span key={x} className={i<3?"done":i===3?"on":""}><i>{i<3?"✓":i+1}</i>{x}</span>)}<div className="token-box"><small>本单 Token</small><b>182 / 500</b><progress value="182" max="500"/></div></aside><div className="workspace-main"><div className="tabs"><button className="on">交付版本</button><button>沟通记录</button><button>验收标准</button><button>订单变更</button></div><div className="version-card"><span>当前版本</span><h3>团队行程协作工具 · v0.9</h3><p>已完成角色权限、共同编辑与版本历史；PDF 导出等待最终检查。</p><div className="checklist"><label><input type="checkbox" defaultChecked/> 3 个角色权限</label><label><input type="checkbox" defaultChecked/> 多人协作</label><label><input type="checkbox" defaultChecked/> 版本回退</label><label><input type="checkbox"/> PDF 导出检查</label></div><button className="secondary" onClick={()=>flash("平台检查：发现 1 项验收要求尚未完成")}>对照验收标准检查</button></div>{delivered?<div className="delivered"><b>✓ 已提交需求方验收</b><p>需求方有 3 天确认或按验收条目提出修改。</p><button onClick={()=>{flash("模拟验收通过，¥1,968 已进入结算");go("creator","创作者中心");}}>模拟验收通过</button></div>:<button className="primary" onClick={()=>setDelivered(true)}>提交交付审批并送验</button>}</div></div></Page> }

function NeedView({setStep,go,flash,onAnalyzed}:{setStep:(n:number)=>void;go:(v:View,l:string)=>void;flash:(s:string)=>void;onAnalyzed:(x:NeedAnalysis)=>void}) {
  const message="我想做一个给旅行社内部使用的行程规划工具，可以多人协作，也能发给客户确认。";
  const options=["10–20 人","需要角色权限","两周内"];
  const [selected,setSelected]=useState(options);
  const [supplement,setSupplement]=useState("");
  const [analyzing,setAnalyzing]=useState(false);
  const toggle=(value:string)=>setSelected(x=>x.includes(value)?x.filter(v=>v!==value):[...x,value]);
  async function analyze(){
    if(analyzing)return;
    setAnalyzing(true);
    try{
      const response=await fetch("/api/needs/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message,answers:selected,supplement})});
      const data=await response.json() as {analysis?:NeedAnalysis;error?:string};
      if(!response.ok||!data.analysis)throw new Error(data.error||"分析失败");
      onAnalyzed(data.analysis);
      setStep(1);
      go("need-draft","匹配已有内容");
    }catch{flash("需求分析暂时失败，请稍后再试");}
    finally{setAnalyzing(false);}
  }
  return <Page title="把你的问题讲给来造" eyebrow="PERSONAL NEED" intro=""><div className="agent-chat"><div className="chat-head"><Icon>来</Icon><div><b>来造客服</b><span>只协助导航和整理，不会替你发布或付款</span></div></div><div className="bubble user">{message}</div><div className="bubble bot">为了匹配现有内容，请确认使用人数、必须保留的功能和完成时间。</div><div className="quick">{options.map(x=><button key={x} className={selected.includes(x)?"selected":""} onClick={()=>toggle(x)}>{x}</button>)}</div><div className="composer"><input value={supplement} onChange={e=>setSupplement(e.target.value)} placeholder="补充你的需求…"/><button disabled={analyzing} onClick={analyze}>{analyzing?"分析中…":"继续分析 →"}</button></div></div></Page>
}

function NeedDraft({go,setNeedStep,analysis}:{go:(v:View,l:string)=>void;setNeedStep:(n:number)=>void;analysis:NeedAnalysis|null}) {
  const match=analysis?.match||{name:"松弛感旅行规划器",type:"网页",fit:76,reason:"已有路线生成和客户分享能力。",missing:["团队成员角色权限","共同编辑","客户确认状态"]};
  return <Page title={analysis?.summaryTitle||"先看看已有解决方案"} eyebrow="MATCH EXISTING WORKS" intro=""><div className="existing-match"><div className="match-work mint"><span>旅</span><div><small>{match.fit}% 匹配 · {match.type}</small><h3>{match.name}</h3><p>{match.reason}</p></div></div><div className="gap"><h3>还缺什么</h3>{match.missing.map(x=><span key={x}>{x}</span>)}</div><div className="decision"><button className="secondary" onClick={()=>go("experience","直接使用已有作品")}>已有作品够用</button><button className="secondary" onClick={()=>go("mentor","生成改造提示词")}>生成外部改造提示词</button><button className="primary" onClick={()=>{setNeedStep(2);go("match","发布定制需求");}}>继续发布需求</button></div></div></Page>
}

function MatchView({go,setNeedStep}:{go:(v:View,l:string)=>void;setNeedStep:(n:number)=>void}) { return <Page title="需求草稿与创作者匹配" eyebrow="READY TO MATCH" intro="Agent 已把聊天整理为可报价、可验收的需求；发布前由你最终确认。"><div className="match-layout"><div className="draft-card"><span className="tag">需求草稿</span><h3>旅行社团队行程协作工具</h3><Summary label="目标" value="让 10–20 人共同制作并向客户确认行程"/><Summary label="交付" value="网页 · 权限 · 协作 · 版本 · PDF"/><Summary label="预算" value="¥1,500–2,500"/><Summary label="期限" value="14 天内"/><Summary label="验收" value="10 人同时使用，版本可回退，导出完整"/><button className="text-btn">编辑需求草稿</button></div><div className="candidates"><h3>推荐创作者</h3>{[{n:"乔木",s:"96%",p:"¥2,200",d:"7 天"},{n:"弥生 Studio",s:"89%",p:"¥2,480",d:"10 天"},{n:"小北",s:"84%",p:"¥1,900",d:"12 天"}].map((c,i)=><div className="candidate" key={c.n}><span>{c.n.slice(0,1)}</span><div><b>{c.n}</b><small>相关作品 {4-i} 个 · 准时率 {98-i*2}%</small></div><em>{c.s} 匹配</em><strong>{c.p} · {c.d}</strong><button onClick={()=>{setNeedStep(3);go("accept","确认订单");}}>选择</button></div>)}</div></div></Page> }

function OrderAccepted({go}:{go:(v:View,l:string)=>void}) { return <Page title="订单已确认" eyebrow="BUDGET ESCROWED" intro="范围、验收、价格与权属已确认；预算托管后，创作者正式开始制作。"><div className="success-panel"><Icon>✓</Icon><h2>乔木已开始制作</h2><p>订单金额 ¥2,200 · 预计 7 天交付 · 包含 2 次范围内修改</p><div className="status-line"><span className="done">条款确认</span><i/><span className="done">预算托管</span><i/><span className="on">制作中</span><i/><span>验收</span></div><div className="success-actions"><button className="primary" onClick={()=>go("workspace","订单工作台")}>进入订单工作台</button><button className="secondary" onClick={()=>go("map","路径地图")}>体验其他路径</button></div></div></Page> }

function EnterpriseView({go}:{go:(v:View,l:string)=>void}) { const creators=[["林","林小满","互动 H5、网页小游戏、数据可视化","4.9 · 2 小时响应"],["乔","乔木","旅行工具、内容产品、轻量网页","4.8 · 当前可接单"],["昼","林昼","品牌内容、工作流设计、AI 应用","4.9 · 128 次成交"]]; return <Page title="定制合作" eyebrow="CUSTOM COLLABORATION" intro="从一个合作中心选择路径：个人需求找创作者，企业采购成熟作品，复杂项目由平台负责。"><div className="collab-routes"><button onClick={()=>go("need","发布个人需求")}><span>01</span><h2>发布个人需求</h2><p>先匹配已有作品，再整理范围、预算和交付标准。</p><b>开始整理需求 →</b></button><button onClick={()=>go("catalog","企业作品采购")}><span>02</span><h2>采购已有作品</h2><p>试用成熟作品，确认授权、成员范围和年度费用。</p><b>进入企业目录 →</b></button><button onClick={()=>go("consult","平台咨询与定制")}><span>03</span><h2>平台定制服务</h2><p>由平台完成诊断、PoC、实施、验收和长期运维。</p><b>描述企业问题 →</b></button></div><div className="collab-creators"><div className="content-heading"><div><h2>推荐创作者</h2><p>根据能力、成交评价与当前响应状态选择。</p></div><button className="secondary" onClick={()=>go("need","发布个人需求")}>带着需求找人 →</button></div><div>{creators.map((x,i)=><button key={x[1]} onClick={()=>go(i===0?"profile":"need",i===0?"林小满的主页":"找创作者")}><span>{x[0]}</span><div><small>认证创作者</small><h3>{x[1]}</h3><p>{x[2]}</p><b>{x[3]}</b></div><em>{i===0?"查看公开主页":"发起合作"} →</em></button>)}</div></div></Page> }

function EnterpriseCatalog({go}:{go:(v:View,l:string)=>void}) { return <Page title="企业作品采购目录" eyebrow="VERIFIED FOR BUSINESS" intro="只有经过权属、稳定性、安全和企业可用性审核的成熟作品，才能进入采购目录。"><div className="catalog-toolbar"><div className="search small"><span>⌕</span><input placeholder="搜索业务场景或作品"/></div><button className="secondary">行业：全部</button><button className="secondary">授权：订阅</button></div><div className="enterprise-list">{works.filter(w=>w.enterprise).map((w,i)=><article key={w.id}><div className={`enterprise-cover ${w.tone}`}>{w.icon}<span>企业可采购</span></div><div><small>{w.type} · 已通过平台企业审核</small><h3>{w.title}</h3><p>{w.desc}</p><div className="enterprise-tags"><span>团队使用</span><span>版本维护</span><span>数据说明</span></div><footer><b>{i===0?"¥6,800/年":i===1?"¥3,600/年":"¥18,000/年"}</b><button onClick={()=>go("procure",`${w.title} · 企业采购`)}>申请演示</button></footer></div></article>)}</div><div className="catalog-note">超出现有作品标准范围的新功能、系统集成或特殊安全要求，将由平台转入咨询与定制路径，创作者不直接接企业定制。</div></Page> }

function ProcureView({step,setStep,go,flash}:{step:number;setStep:(n:number)=>void;go:(v:View,l:string)=>void;flash:(s:string)=>void}) { const data=[{t:"申请演示",c:<div className="enterprise-demo"><div className="demo-panel mint"><b>旅行规划器 · 团队演示环境</b><p>包含路线生成、客户分享与基础团队配置</p></div><div className="demo-info"><h3>演示已准备好</h3><p>14 天试用 · 最多 5 位成员 · 使用样例数据</p><button className="secondary" onClick={()=>flash("已打开隔离的企业演示环境")}>打开演示</button></div></div>},{t:"选择企业授权",c:<Choice title="选择授权方式" sub="采购的是明确范围的使用权，不默认购买知识产权。" value="企业订阅" options={[{v:"企业订阅",d:"20 人 · 1 年 · 含标准更新"},{v:"部署包授权",d:"单一企业环境 · 1 年更新"},{v:"买断使用权",d:"需创作者单独确认"}]} onChoose={()=>{}}/>},{t:"确认费用",c:<div className="choice-wrap"><h2>年度费用明细</h2><div className="invoice"><Summary label="企业使用授权" value="¥5,800"/><Summary label="平台开通与保障" value="¥600"/><Summary label="预计 Token 预存" value="¥400"/><Summary label="合计" value="¥6,800"/></div><p>包含 20 位成员、标准版本更新和平台售后；不包含新增功能和系统集成。</p></div>},{t:"完成采购",c:<div className="choice-wrap"><h2>企业采购信息</h2><div className="two"><label>企业名称<input defaultValue="远山旅行有限公司"/></label><label>统一社会信用代码<input placeholder="用于合同与发票"/></label></div><label>管理员邮箱<input defaultValue="admin@yuanshan.example"/></label><label className="check"><input type="checkbox" defaultChecked/> 已阅读企业授权、数据和停止服务规则</label></div>},{t:"开通成功",c:<div className="success-inline"><Icon>✓</Icon><h2>企业版已开通</h2><p>20 个成员席位 · 授权至 2027-08-09 · 创作者分成进入结算</p><button className="secondary" onClick={()=>go("enterprise","企业服务")}>返回企业服务</button></div>}]; return <Page title="采购 · 松弛感旅行规划器" eyebrow="ENTERPRISE PROCUREMENT" intro="平台负责授权、合同、开通和售后；创作者获得作品采购收入。"><div className="flow-card">{data[step].c}<div className="flow-actions">{step>0&&step<4&&<button className="secondary" onClick={()=>setStep(step-1)}>上一步</button>}{step<4&&<button className="primary" onClick={()=>setStep(step+1)}>{step===3?"确认采购并开通":"继续"}</button>}</div></div></Page> }

function ConsultView({step,setStep,go}:{step:number;setStep:(n:number)=>void;go:(v:View,l:string)=>void}) { const parts=[<div className="choice-wrap" key="a"><h2>先讲业务问题，不急着定义 Agent</h2><p>平台会判断已有作品能否满足，再决定是否需要正式诊断。</p><label>目前哪个环节最需要改善？<textarea defaultValue="客服每天要从多个产品文档中找答案，响应慢且内容不一致。"/></label><div className="two"><label>使用规模<input defaultValue="80 位客服，每月约 2 万次咨询"/></label><label>目标<input defaultValue="平均响应时间降低 50%"/></label></div></div>,<div className="choice-wrap" key="b"><h2>补充数据、系统与限制</h2><div className="setting-list"><Setting title="已有系统" value="企业微信 + Zendesk" options={["企业微信 + Zendesk","飞书 + 自研客服"]}/><Setting title="数据" value="产品文档与历史工单" options={["产品文档与历史工单","仅产品文档"]}/><Setting title="模型限制" value="敏感数据不可出境" options={["敏感数据不可出境","允许合规模型"]}/><Setting title="期望上线" value="8 周内" options={["4 周内","8 周内","本季度"]}/></div></div>,<div className="choice-wrap" key="c"><h2>平台诊断结果</h2><div className="diagnosis"><span>已有作品复用</span><b>知识库问答 Agent 可复用约 45%</b><span>需要新增</span><b>数据连接、权限、评测、人工转接</b><span>建议路径</span><b>先做 3 周 PoC，再决定正式实施</b><span>主要风险</span><b>历史工单质量与敏感数据权限</b></div></div>,<div className="choice-wrap" key="d"><h2>PoC 方案与指标</h2><div className="metric-cards"><Mini label="范围" value="2 类产品 · 10 位客服"/><Mini label="周期" value="3 周"/><Mini label="费用" value="¥38,000"/><Mini label="成功标准" value="准确率 ≥ 85%"/></div><p>企业只与来造平台签约。平台负责 PoC、数据处理、项目管理和最终交付。</p></div>,<div className="success-inline" key="e"><Icon>✓</Icon><h2>PoC 项目已立项</h2><p>合同与首阶段费用已确认，平台项目负责人将在工作台推进。</p><button className="primary" onClick={()=>go("poc","PoC 工作台")}>进入 PoC 工作台</button></div>]; return <Page title="平台咨询与需求诊断" eyebrow="PLATFORM-LED SERVICE" intro="企业不与创作者撮合。来造平台承担咨询、方案、实施、验收和运维责任。"><div className="flow-card">{parts[step]}<div className="flow-actions">{step>0&&step<4&&<button className="secondary" onClick={()=>setStep(step-1)}>上一步</button>}{step<4&&<button className="primary" onClick={()=>setStep(step+1)}>{step===3?"签约并启动 PoC":"继续诊断"}</button>}</div></div></Page> }

function PocView({go,setConsultStep}:{go:(v:View,l:string)=>void;setConsultStep:(n:number)=>void}) { return <Page title="客服知识 Agent · PoC" eyebrow="WEEK 2 OF 3" intro="PoC 只验证最不确定的假设，不做缩小版完整产品。"><div className="project-board"><aside><b>PoC 指标</b><Mini label="回答准确率" value="87% / ≥85%"/><Mini label="响应速度" value="2.3s / ≤3s"/><Mini label="人工转接" value="11% / ≤15%"/><Mini label="单次成本" value="¥0.18 / ≤¥0.25"/></aside><div><div className="project-top"><span className="success">4 项指标中 4 项达标</span><b>总体进度 76%</b></div><div className="kanban"><section><h3>待企业配合</h3><article><b>确认退货政策新版本</b><small>负责人：王敏 · 今天</small></article></section><section><h3>平台处理中</h3><article><b>补充 120 条边界评测</b><small>AI 质量 · 明天</small></article><article><b>企业微信权限联调</b><small>工程 · 2 天后</small></article></section><section><h3>已完成</h3><article><b>知识库清洗与切分</b><small>✓ 8 月 7 日</small></article><article><b>敏感数据访问审计</b><small>✓ 8 月 8 日</small></article></section></div><button className="primary" onClick={()=>{setConsultStep(4);go("project","正式项目")}}>模拟 PoC 达标，进入正式实施</button></div></div></Page> }

function EnterpriseProject({go}:{go:(v:View,l:string)=>void}) { return <Page title="客服知识 Agent · 正式项目" eyebrow="IMPLEMENTATION & OPS" intro="企业与平台共同查看范围、里程碑、成本和验收；平台内部组织产品、工程、AI 与安全能力。"><div className="project-summary"><div><span>当前阶段</span><b>系统集成与灰度</b><small>预计 9 月 18 日上线</small></div><div><span>项目金额</span><b>¥268,000</b><small>已支付 60%</small></div><div><span>运行预算</span><b>¥8,000/月</b><small>当前预测 ¥6,740</small></div><div><span>SLA</span><b>99.9%</b><small>故障响应 ≤ 30 分钟</small></div></div><div className="timeline-project">{["需求诊断","PoC 达标","正式开发","安全验收","灰度上线","运维优化"].map((x,i)=><div className={i<3?"done":i===3?"on":""} key={x}><span>{i<3?"✓":i+1}</span><b>{x}</b><small>{i<3?"已完成":i===3?"进行中":"待开始"}</small></div>)}</div><div className="project-panels"><section><h3>企业待办</h3><p>确认 3 类高风险问题的人工转接规则</p><button>查看并确认</button></section><section><h3>平台交付</h3><p>v1.2 灰度版本 · 安全扫描通过 · 成本预测正常</p><button>查看版本报告</button></section><section><h3>上线后</h3><p>监控效果、成本与安全，按 SLA 运维并持续优化</p><button onClick={()=>go("platform","平台能力")}>查看平台保障</button></section></div></Page> }

function AdminNav({view,jump}:{view:View;jump:(v:View,l:string)=>void}) {
  const items:[View,string,UiIconName][]= [["admin-overview","数据总览","analysis"],["admin-review","作品审核","testing"],["admin-reports","举报处理","security"],["admin-contributors","贡献者管理","profile"],["admin-audit","审计与归档","document"],["admin-config","平台配置","settings"]];
  return <aside className="admin-nav"><div className="admin-nav-brand"><span>管</span><div><b>来造管理台</b><small>平台运营工作区</small></div></div><nav>{items.map(x=><button key={x[0]} className={view===x[0]?"on":""} onClick={()=>jump(x[0],x[1])}><UiIcon name={x[2]} size="small"/>{x[1]}</button>)}</nav><button className="admin-exit" onClick={()=>jump("home","首页")}>退出管理台</button></aside>
}

function AdminLogin({go,user,openLogin}:{go:(v:View,l:string)=>void;user:AppUser|null;openLogin:()=>void}) {
  const permitted = Boolean(user?.is_admin);
  return <section className="admin-login-page"><div className="admin-login-card"><span className="admin-lock"><UiIcon name="security"/></span><small>来造平台运营</small><h1>{permitted ? "管理员身份已验证" : "管理员登录"}</h1><p>{permitted ? `当前账号：${user?.display_name}` : "请使用管理员账号和密码登录，再进入审核和数据后台。"}</p>{!permitted && <p className="status-soft">本地管理员账号：admin</p>}<button className="primary wide" onClick={()=>permitted ? go("admin-overview","数据总览") : openLogin()}>{permitted ? "进入管理台" : "账号密码登录"}</button><button className="text-btn wide" onClick={()=>go("home","首页")}>返回前台</button></div></section>
}

function AdminOverview({go,flash}:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  const [funnel,setFunnel]=useState<Funnel|null>(null);
  useEffect(()=>{getFunnel().then(setFunnel).catch((e:Error)=>flash(e.message));},[]);
  const counts=funnel?.counts||{};
  const metrics=[[String(counts.publish_started||0),'开始发布'],[String(counts.work_submitted||0),'提交审核'],[String(counts.work_approved||0),'审核通过'],[String(counts.work_viewed||0),'作品浏览'],[String(counts.order_created||0),'创建订单'],[String(counts.payment_succeeded||0),'支付成功'],[`${Math.round((funnel?.view_to_order_rate||0)*100)}%`,'浏览转下单'],[`${Math.round((funnel?.order_to_paid_rate||0)*100)}%`,'下单转支付']];
  return <AdminPage title="平台数据总览" note={funnel?`数据区间：${funnel.from_date.slice(0,10)} 至 ${funnel.to_date.slice(0,10)}`:'正在读取真实运营数据'}><div className="admin-metrics">{metrics.map((x,i)=><article key={x[1]} className={i===2?'warn':''}><b>{x[0]}</b><span>{x[1]}</span></article>)}</div><div className="admin-overview-grid"><section className="admin-card"><div className="admin-card-head"><h2>运营动作</h2><span>实时 API</span></div><button className="queue-row" onClick={()=>go("admin-review","作品审核")}><span>作品审核</span><b>{counts.work_submitted||0} 次提交</b><em>进入 →</em></button><div className="queue-row"><span>支付完成</span><b>{counts.payment_succeeded||0} 单</b><em>已记录</em></div></section><section className="admin-card"><div className="admin-card-head"><h2>交易漏斗</h2><span>近 30 天</span></div><div className="chart-legend"><span>浏览：{counts.work_viewed||0}</span><span>下单：{counts.order_created||0}</span><span>支付：{counts.payment_succeeded||0}</span></div></section></div></AdminPage>
}

function AdminReview({flash}:{flash:(s:string)=>void}) {
  const [items,setItems]=useState<ReviewWork[]>([]); const [loading,setLoading]=useState(true); const [rejecting,setRejecting]=useState<string|null>(null);
  const refresh=()=>{setLoading(true);getPendingReviews().then(setItems).catch((e:Error)=>flash(e.message)).finally(()=>setLoading(false));};
  useEffect(() => { void refresh(); }, []);
  const approve=async(id:string)=>{try{await approveWork(id);flash('作品已通过审核并进入市场');refresh();}catch(e){flash(e instanceof Error?e.message:'审核失败');}};
  const reject=async(id:string)=>{const note=window.prompt('请输入驳回原因（会展示给创作者）');if(!note)return;try{setRejecting(id);await rejectWork(id,note);flash('作品已驳回');refresh();}catch(e){flash(e instanceof Error?e.message:'驳回失败');}finally{setRejecting(null);}};
  return <AdminPage title="作品审核" note={loading?'正在读取待审核作品':`待审 ${items.length} 件`}><div className="admin-tabs"><button className="on">待审核</button><button onClick={refresh}>刷新</button></div>{items.length===0&&!loading?<section className="admin-card"><h2>暂无待审核作品</h2><p>创作者提交作品后会自动出现在这里。</p></section>:items.map(item=><section className="review-card" key={item.id}><div><span className="status-soft">待人工审核</span><small>{item.tags || '未分类'} · {new Date(item.created_at).toLocaleString()}</small><h2>{item.title}</h2><p>{item.description || '未填写作品介绍'}</p></div><div className="review-actions"><button className="primary" onClick={()=>approve(item.id)}>通过</button><button className="danger" disabled={rejecting===item.id} onClick={()=>reject(item.id)}>{rejecting===item.id?'处理中…':'驳回'}</button></div><aside><b>审核提示</b><span>确认作品可运行</span><span>确认不含侵权或敏感内容</span><span>驳回时请写清修改原因</span></aside></section>)}<AdminOfflinePayments flash={flash}/></AdminPage>
}

function AdminOfflinePayments({flash}:{flash:(s:string)=>void}) { const [items,setItems]=useState<PendingOfflinePayment[]>([]); const [working,setWorking]=useState<string|null>(null); const refresh=()=>getPendingOfflinePayments().then(setItems).catch((e:Error)=>flash(e.message)); useEffect(() => { void refresh(); }, []); const confirm=async(id:string)=>{if(!window.confirm('已核对创作者实际到账？确认后将立即交付作品。'))return;try{setWorking(id);await confirmOfflinePayment(id);flash('已确认付款并交付作品');refresh();}catch(e){flash(e instanceof Error?e.message:'确认失败');}finally{setWorking(null);}}; return <section className="admin-card" style={{marginTop:24}}><div className="admin-card-head"><h2>线下付款凭证核验</h2><button className="secondary" onClick={refresh}>刷新</button></div>{items.length===0?<p>暂无待核验凭证。</p>:items.map(item=><div className="admin-table-row" key={item.order_id}><b>{item.title}<small>买家：{item.buyer_name}</small></b><span>¥{(item.amount_cents/100).toFixed(2)}</span><span>{item.note||'无备注'}</span><a href={item.proof_url} target="_blank" rel="noreferrer">查看凭证</a><button className="primary" disabled={working===item.order_id} onClick={()=>confirm(item.order_id)}>{working===item.order_id?'确认中…':'确认到账并交付'}</button></div>)}</section>; }

function AdminReports({flash}:{flash:(s:string)=>void}) {
  const [open,setOpen]=useState(false);
  return <AdminPage title="举报处理" note="待处理 0"><section className={`report-case ${open?'open':''}`}><div className="report-main"><span className="status-soft">已处理</span><h2>高考志愿智能填报模拟器</h2><p>举报原因：虚假宣传 · 举报人：刘馥妮 · 08-09 14:36</p><button className="secondary" onClick={()=>setOpen(!open)}>{open?'收起处理详情':'查看处理详情'}</button></div>{open&&<div className="report-detail"><b>处理结论</b><p>该作品无真实服务能力，已下架并通知创作者；相关展示数据已停止推荐。</p><span>处理人：平台审核员 · 证据已归档</span></div>}</section><section className="admin-card"><div className="admin-card-head"><h2>举报规则</h2><button onClick={()=>flash('举报规则配置已打开')}>配置规则</button></div><div className="rule-grid"><div><b>虚假宣传</b><span>人工复核</span></div><div><b>侵权内容</b><span>立即限流</span></div><div><b>恶意代码</b><span>自动下架</span></div><div><b>无法使用</b><span>通知维护</span></div></div></section></AdminPage>
}

function AdminContributors({flash}:{flash:(s:string)=>void}) {
  const [maintenance,setMaintenance]=useState(true);
  return <AdminPage title="官方贡献者管理" note="2 条贡献关系"><div className="admin-filter-row"><select defaultValue="拼豆图纸生成器"><option>全部官方工具</option><option>拼豆图纸生成器</option><option>旅行行程规划器</option></select><select><option>全部角色</option><option>产品</option><option>运营</option><option>工程</option></select><label className="check"><input type="checkbox" checked={maintenance} onChange={e=>setMaintenance(e.target.checked)}/> 仅看维护中</label><div className="admin-search"><input placeholder="搜索员工邮箱或用户名"/><button onClick={()=>flash('已完成贡献者搜索')}>搜索</button></div></div><section className="admin-card contributor-list"><span className="list-label">全部贡献关系</span>{[['旅行行程规划器','产品 · 刘馥妮','使用 8 次 · 2026-08-10'],['拼豆图纸生成器','产品 · 刘馥妮','使用 1 次 · 2026-08-10']].map(x=><div key={x[0]}><div><b>{x[0]}</b><span>{x[1]}</span><small>{x[2]}</small></div><label className="check"><input type="checkbox" defaultChecked/> 维护中</label><em>已生效</em><button className="secondary" onClick={()=>flash(`已移除「${x[0]}」贡献者标识`)}>移除标识</button></div>)}</section></AdminPage>
}

function AdminAudit({flash}:{flash:(s:string)=>void}) {
  const logs=[['上传作品','马昱 · work#13','PDF 编辑器／预审通过','08-14 22:52'],['同意协议','马昱 · user#380','用户协议 v1.0／隐私协议 v1.0','08-14 22:50'],['同意协议','龙添豪 · user#1253','用户协议 v1.0／隐私协议 v1.0','08-10 22:32'],['头像审核','刘馥妮 · creator#刘馥妮','通过','08-10 18:44'],['头像审核','刘馥妮 · creator#刘馥妮','驳回：测试驳回','08-10 18:30']];
  return <AdminPage title="审计与归档" note="记录按规则留存"><section className="admin-card"><div className="admin-card-head"><h2>操作日志</h2><button onClick={()=>flash('操作日志已导出')}>导出日志</button></div><div className="audit-list">{logs.map((x,i)=><div key={`${x[0]}${i}`}><b>{x[0]}</b><span>{x[1]}</span><span>{x[2]}</span><time>{x[3]}</time></div>)}</div></section><section className="admin-card"><div className="admin-card-head"><h2>数据保留</h2><button onClick={()=>flash('保留规则已打开')}>配置保留规则</button></div><div className="retention-grid">{[['操作日志','180 天','30 条'],['举报记录','180 天','1 条'],['工具使用记录','180 天','9 条'],['企业咨询线索','365 天','1 条']].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><em>{x[2]}均在保留期</em></div>)}</div></section></AdminPage>
}

function AdminConfig({flash}:{flash:(s:string)=>void}) {
  const [savedConfig,setSavedConfig]=useState(false);
  return <AdminPage title="平台配置" note={savedConfig?'配置已保存':'有 2 项未保存'}><div className="config-grid"><section className="admin-card"><h2>内容与审核</h2><Setting title="新作品审核" value="自动预审后人工确认" options={['自动预审后人工确认','全部人工审核']}/><Setting title="外部链接" value="先隔离检查" options={['先隔离检查','禁止外部链接']}/><label className="toggle-row"><span><b>高风险作品自动下架</b><small>恶意代码、钓鱼与敏感数据外传</small></span><input type="checkbox" defaultChecked/></label></section><section className="admin-card"><h2>官方工具</h2><Setting title="上新状态" value="每周 1–2 个" options={['每周 1–2 个','暂停上新']}/><label className="toggle-row"><span><b>显示使用次数</b><small>只展示有效使用口径</small></span><input type="checkbox" defaultChecked/></label><label className="toggle-row"><span><b>维护中标识</b><small>异常时展示维护状态</small></span><input type="checkbox" defaultChecked/></label></section><section className="admin-card"><h2>交易与需求</h2><Setting title="个人需求" value="审核后公开" options={['审核后公开','暂不开放']}/><Setting title="报价方式" value="提交方案与报价" options={['提交方案与报价','抢单']}/></section><section className="admin-card"><h2>功能开关</h2>{['企业采购申请','提示词导师','创作者接单中心'].map(x=><label className="toggle-row" key={x}><span><b>{x}</b></span><input type="checkbox" defaultChecked/></label>)}</section></div><div className="config-actions"><button className="secondary" onClick={()=>flash('修改已撤销')}>撤销修改</button><button className="primary" onClick={()=>{setSavedConfig(true);flash('平台配置已保存')}}>保存配置</button></div></AdminPage>
}

function AdminPage({title,note,children}:{title:string;note:string;children:React.ReactNode}) { return <section className="admin-page"><div className="admin-page-head"><div><span>平台运营工作区</span><h1>{title}</h1></div><small>{note}</small></div>{children}</section> }

function PlatformView({go}:{go:(v:View,l:string)=>void}) { const mods=[{n:"作品与发布",d:"草稿、权限、审批、版本、下架",i:"作"},{n:"审核与分级",d:"运行、安全、版权、成本、质量",i:"审"},{n:"搜索与推荐",d:"长期使用、尝鲜、明确需求三种目标",i:"搜"},{n:"个人需求与订单",d:"需求、撮合、托管、交付、验收",i:"单"},{n:"企业采购与项目",d:"授权采购、平台诊断、PoC、SLA",i:"企"},{n:"Token 与结算",d:"计量、预估、托管、分成、退款",i:"币"},{n:"模型与算力网关",d:"路由、限额、成本、审计、故障切换",i:"算"},{n:"安全与争议",d:"隐私、风控、证据、申诉与裁决",i:"盾"}]; return <Page title="平台如何支撑三方闭环" eyebrow="PLATFORM OPERATIONS" intro="用户前台背后，需要作品、交易、治理和基础设施共同工作。"><div className="platform-grid">{mods.map(m=><article key={m.n}><Icon>{m.i}</Icon><h3>{m.n}</h3><p>{m.d}</p><span>运行正常</span></article>)}</div><div className="governance"><div><span>今日自动审核</span><b>238</b><small>17 条转人工复核</small></div><div><span>有效使用率</span><b>84.6%</b><small>不是只看点击</small></div><div><span>撮合成交</span><b>21 单</b><small>预算托管率 100%</small></div><div><span>算力异常</span><b>0.3%</b><small>已自动限流</small></div></div><div className="platform-flow"><h2>内容与交易如何形成飞轮</h2><p>作品被发现和使用 → 产生反馈与个性化需求 → 创作者完成个人定制／平台完成企业定制 → 经授权沉淀新能力 → 下一位用户更快得到解决。</p><button className="primary" onClick={()=>go("map","路径地图")}>回到全部体验路径</button></div></Page> }

function MentorView({go,flash}:{go:(v:View,l:string)=>void;flash:(s:string)=>void}) {
  const [brief,setBrief]=useState({goal:"",audience:"",materials:"",result:"",rules:""});
  const [generated,setGenerated]=useState(false);
  const set=(key:keyof typeof brief,value:string)=>setBrief(s=>({...s,[key]:value}));
  const prompt=`你是一名产品与实现顾问。请基于以下信息，在我的当前 Agent 或 AI 平台中协助我完成任务。\n\n目标：${brief.goal||"待填写"}\n使用者：${brief.audience||"待填写"}\n已有材料：${brief.materials||"无"}\n期望结果：${brief.result||"待填写"}\n限制与数据规则：${brief.rules||"无"}\n\n请先复述目标并列出仍需确认的问题，再给出最小可行版本、执行步骤、验收标准和风险。不要虚构资料；遇到关键缺失信息时先提问。`;
  const copy=async()=>{try{await navigator.clipboard.writeText(prompt);flash("提示词已复制，请粘贴到你自己的 Agent 或 AI 平台");}catch{flash("请手动选择并复制提示词");}};
  return <Page title="生成一份可直接使用的外部提示词" eyebrow="导师 Agent" intro="来造只整理提示词，不生成代码；实际创作与开发在你自己的 Agent 或 AI 平台完成。"><div className="idea-layout creative"><section className="idea-conversation"><div className="mentor-line"><span>导</span><div><small>提示词导师</small><h2>把目标和边界写清楚</h2></div></div><label>你要完成什么？<textarea value={brief.goal} onChange={e=>set("goal",e.target.value)} placeholder="例如：做一个旅行社团队行程协作网页"/></label><div className="two"><label>谁会使用？<input value={brief.audience} onChange={e=>set("audience",e.target.value)} placeholder="例如：旅行顾问与客户"/></label><label>希望得到什么结果？<input value={brief.result} onChange={e=>set("result",e.target.value)} placeholder="例如：可测试的网页版本"/></label></div><label>已有材料<textarea value={brief.materials} onChange={e=>set("materials",e.target.value)} placeholder="参考链接、文件、数据或现有版本"/></label><label>限制与数据规则<textarea value={brief.rules} onChange={e=>set("rules",e.target.value)} placeholder="技术、隐私、预算、周期与不能做的事"/></label><div className="idea-actions"><button className="secondary" onClick={()=>go("need","找创作者完成")}>改为找创作者</button><button className="primary" disabled={!brief.goal.trim()} onClick={()=>setGenerated(true)}>生成提示词 →</button></div></section><aside className="live-brief shaped"><h3>生成结果</h3>{generated?<><textarea aria-label="生成的提示词" readOnly value={prompt}/><div className="idea-actions"><button className="primary" onClick={copy}>复制提示词</button></div><div className="brief-suggestion"><small>下一条路线</small><b>复制 → 打开自己的 Agent／AI 平台 → 粘贴执行 → 完成并测试 → 回到来造发布</b></div></>:<div className="brief-note"><span>待生成</span><p>填写目标后生成；这里不会运行代码或直接制作作品。</p></div>}</aside></div></Page>
}

function Page({title,eyebrow,intro: _intro,children}:{title:string;eyebrow:string;intro:string;children:React.ReactNode}) { return <section className="page"><div className="shell"><div className="page-head"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</div></section> }
function SectionHead({kicker,title,sub}:{kicker:string;title:string;sub?:string}) { return <div className="section-head"><span className="eyebrow">{kicker}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div> }
function RoleCard({icon,title,desc,actions,go}:{icon:string;title:string;desc:string;actions:string[][];go:(v:View,l:string)=>void}) { return <article className="role-card"><Icon>{icon}</Icon><h3>{title}</h3><p>{desc}</p><div>{actions.map((a,i)=><button key={a[0]} className={i===0?"primary":"secondary"} onClick={()=>go(a[1] as View,a[0])}>{a[0]} →</button>)}</div></article> }
function Choice({title,sub,value,options,onChoose}:{title:string;sub:string;value:string;options:{v:string;d:string}[];onChoose:(v:string)=>void}) { return <div className="choice-wrap"><h2>{title}</h2>{sub&&<p>{sub}</p>}<div className="choice-grid">{options.map(o=><button className={value===o.v?"selected":""} key={o.v} onClick={()=>onChoose(o.v)}><span>{value===o.v?"✓":""}</span><b>{o.v}</b><small>{o.d}</small></button>)}</div></div> }
function Setting({title,value,options,onChange}:{title:string;value:string;options:string[];onChange?:(v:string)=>void}) { return <label className="setting"><span>{title}</span><select value={value} onChange={e=>onChange?.(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label> }
function Summary({label,value}:{label:string;value:string}) { return <div className="summary-row"><span>{label}</span><b>{value}</b></div> }
function InfoBlock({title,text}:{title:string;text:string}) { return <div className="info-block"><span>{title}</span><p>{text}</p></div> }
function Mini({label,value}:{label:string;value:string}) { return <div className="mini"><span>{label}</span><b>{value}</b></div> }
