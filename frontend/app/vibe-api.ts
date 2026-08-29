export type MarketplaceItem = {
  listing_id: string;
  work_id: string;
  version_id: string;
  title: string;
  description: string;
  cover_url: string;
  trial_url: string;
  tags: string[];
  creator_name: string;
  price_cents: number;
  currency: string;
};

export type AppUser = { id: string; email: string; username: string | null; phone: string | null; display_name: string; is_admin: boolean };
export type AuthSession = { access_token: string; token_type: "bearer"; user: AppUser };
export type PublishedListing = { id: string; work_id: string; version_id: string; price_cents: number; currency: string; status: string };
export type ReviewWork = { id: string; title: string; description: string; tags: string; review_status: string; review_note: string; source_url: string; created_at: string };
export type Funnel = { from_date: string; to_date: string; counts: Record<string, number>; view_to_order_rate: number; order_to_paid_rate: number };
export type OwnedWork = { entitlement_id: string; work_id: string; title: string; description: string; source_url: string; version_number: number; latest_version_number: number; granted_at: string };
export type MyOrder = { order_id: string; title: string; amount_cents: number; currency: string; status: string; created_at: string; paid_at: string | null; refunded_at: string | null };
export type OfflinePaymentInfo = { order_id: string; amount_cents: number; creator_name: string; qr_url: string };
export type WorkVersionHistory = { id: string; version_number: number; changelog: string; created_at: string; is_owned_version: boolean; is_latest: boolean };
export type CreatedOrder = { id: string; status: string };
export type MyWork = { work_id: string; title: string; description: string; tags: string; cover_url: string; trial_url: string; deployment_status: string; deployment_error: string; review_status: string; review_note: string; price_cents: number | null; listing_status: string | null; created_at: string };
export type CreatorSale = { order_id: string; title: string; amount_cents: number; status: string; paid_at: string | null };
export type CreatorDashboard = { total_revenue_cents: number; paid_order_count: number; pending_review_count: number; works: MyWork[]; recent_sales: CreatorSale[] };
export type UploadedWorkPackage = { file_id: string; original_name: string; size_bytes: number; source_url: string };
export type StaticDeployment = { work_id: string; status: string; trial_url: string; message: string };

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "laizao_access_token";

function token() { return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY); }
export function clearSession() { window.localStorage.removeItem(TOKEN_KEY); }
function sessionId() {
  const key = "laizao_session";
  let value = window.sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); window.sessionStorage.setItem(key, value); }
  return value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = token();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((item: { msg?: string }) => item.msg || "请求字段不正确").join("；")
      : body?.detail;
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export function getMarketplace() { return request<MarketplaceItem[]>("/v1/marketplace"); }
export function trackWorkViewed(workId: string, listingId: string) { return request<{ status: string }>("/v1/events/work-viewed", { method: "POST", body: JSON.stringify({ work_id: workId, listing_id: listingId, session_id: sessionId() }) }); }
export function trackWorkTried(workId: string, listingId: string) { return request<{ status: string }>("/v1/events/work-tried", { method: "POST", body: JSON.stringify({ work_id: workId, listing_id: listingId, session_id: sessionId() }) }); }
export function sendSmsCode(phone: string) { return request<{ message: string; debug_code?: string }>("/v1/auth/sms/send", { method: "POST", body: JSON.stringify({ phone }) }); }

export async function verifySmsCode(phone: string, code: string, displayName: string) {
  const session = await request<AuthSession>("/v1/auth/sms/verify", { method: "POST", body: JSON.stringify({ phone, code, display_name: displayName }) });
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  return session.user;
}

export async function registerWithPassword(username: string, password: string, displayName: string) {
  const session = await request<AuthSession>("/v1/auth/register", { method: "POST", body: JSON.stringify({ username, password, display_name: displayName }) });
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  return session.user;
}

export async function loginWithPassword(username: string, password: string) {
  const session = await request<AuthSession>("/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  return session.user;
}

export function getCurrentUser() { return request<AppUser>("/v1/auth/me"); }
export function getEntitlements() { return request<OwnedWork[]>("/v1/me/entitlements"); }
export function getMyOrders() { return request<MyOrder[]>("/v1/me/orders"); }
export function getWorkVersions(workId: string) { return request<WorkVersionHistory[]>(`/v1/me/works/${workId}/versions`); }
export function upgradeOwnedWork(workId: string) { return request(`/v1/me/works/${workId}/upgrade`, { method: "POST", body: "{}" }); }
export function getCreatorDashboard() { return request<CreatorDashboard>("/v1/me/creator/dashboard"); }
export function getPendingReviews() { return request<ReviewWork[]>("/v1/admin/reviews"); }
export function approveWork(workId: string) { return request<ReviewWork>(`/v1/admin/works/${workId}/approve`, { method: "POST", body: "{}" }); }
export function rejectWork(workId: string, note: string) { return request<ReviewWork>(`/v1/admin/works/${workId}/reject`, { method: "POST", body: JSON.stringify({ note }) }); }
export function getFunnel() { return request<Funnel>("/v1/admin/analytics/funnel"); }

export async function uploadWorkPackage(file: File) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("请选择 .zip 格式的作品包");
  if (file.size > 100 * 1024 * 1024) throw new Error("文件不能超过 100MB");
  const form = new FormData(); form.append("file", file);
  const response = await fetch(`${API_BASE}/v1/uploads/work-package`, { method: "POST", headers: token() ? { Authorization: `Bearer ${token()}` } : {}, body: form });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail || "上传失败"); }
  return response.json() as Promise<UploadedWorkPackage>;
}

export async function uploadCoverImage(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("请选择 PNG、JPG 或 WebP 封面图");
  if (file.size > 5 * 1024 * 1024) throw new Error("封面图片不能超过 5MB");
  const form = new FormData(); form.append("file", file);
  const response = await fetch(`${API_BASE}/v1/uploads/cover-image`, { method: "POST", headers: token() ? { Authorization: `Bearer ${token()}` } : {}, body: form });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail || "封面上传失败"); }
  return response.json() as Promise<UploadedWorkPackage>;
}

export function updateWork(workId: string, input: { title: string; description: string; tags: string[]; coverUrl: string; trialUrl: string; priceCents: number }) {
  return request<MyWork>(`/v1/works/${workId}`, { method: "PATCH", body: JSON.stringify({ title: input.title, description: input.description, tags: input.tags, cover_url: input.coverUrl, trial_url: input.trialUrl, price_cents: input.priceCents }) });
}
export function archiveWork(workId: string) { return request<MyWork>(`/v1/works/${workId}/archive`, { method: "POST", body: "{}" }); }
export function deployStaticWork(workId: string) { return request<StaticDeployment>(`/v1/works/${workId}/deploy-static`, { method: "POST", body: "{}" }); }
export function releaseWorkVersion(workId: string, sourceUrl: string, changelog: string) { return request(`/v1/works/${workId}/versions/release`, { method: "POST", body: JSON.stringify({ source_url: sourceUrl, changelog }) }); }

export async function openOwnedSource(sourceUrl: string) {
  if (!sourceUrl.startsWith(API_BASE)) { window.open(sourceUrl, "_blank", "noopener,noreferrer"); return; }
  const response = await fetch(sourceUrl, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail || "无法下载作品文件"); }
  const blobUrl = URL.createObjectURL(await response.blob());
  const name = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] || "work-package.zip";
  const link = document.createElement("a"); link.href = blobUrl; link.download = name; link.click(); URL.revokeObjectURL(blobUrl);
}

export async function publishWork(input: { title: string; description: string; tags: string[]; priceCents: number; sourceUrl: string; coverUrl: string; trialUrl: string; autoDeployStatic?: boolean }) {
  const work = await request<{ id: string }>("/v1/works", { method: "POST", body: JSON.stringify({ title: input.title, description: input.description, tags: input.tags, cover_url: input.coverUrl, trial_url: input.trialUrl }) });
  const version = await request<{ id: string }>(`/v1/works/${work.id}/versions`, { method: "POST", body: JSON.stringify({ source_url: input.sourceUrl, changelog: "来造本地 MVP 发布版本" }) });
  const listing = await request<PublishedListing>("/v1/listings", { method: "POST", body: JSON.stringify({ work_id: work.id, version_id: version.id, price_cents: input.priceCents }) });
  if (input.autoDeployStatic) await deployStaticWork(work.id);
  await request(`/v1/works/${work.id}/submit-review`, { method: "POST", body: "{}" });
  return listing;
}

export function createOrder(listingId: string) { return request<CreatedOrder>("/v1/orders", { method: "POST", body: JSON.stringify({ listing_id: listingId }) }); }
export function simulatePaymentSuccess(orderId: string) { return request(`/v1/orders/${orderId}/simulate-paid`, { method: "POST", body: "{}" }); }
export function simulatePaymentFailed(orderId: string) { return request(`/v1/orders/${orderId}/simulate-payment-failed`, { method: "POST", body: "{}" }); }
export function simulateRefund(orderId: string) { return request(`/v1/orders/${orderId}/simulate-refund`, { method: "POST", body: "{}" }); }
export function savePaymentQr(qrUrl: string) { return request<AppUser>("/v1/me/payment-qr", { method: "PATCH", body: JSON.stringify({ qr_url: qrUrl }) }); }
export function getOfflinePaymentInfo(orderId: string) { return request<OfflinePaymentInfo>(`/v1/orders/${orderId}/offline-payment`); }
export function submitPaymentProof(orderId: string, proofUrl: string, note: string) { return request(`/v1/orders/${orderId}/payment-proof`, { method: "POST", body: JSON.stringify({ proof_url: proofUrl, note }) }); }
export type PendingOfflinePayment = { order_id: string; title: string; amount_cents: number; buyer_name: string; proof_url: string; note: string; created_at: string };
export function getPendingOfflinePayments() { return request<PendingOfflinePayment[]>("/v1/admin/offline-payments"); }
export function confirmOfflinePayment(orderId: string) { return request(`/v1/admin/orders/${orderId}/confirm-offline-payment`, { method: "POST", body: "{}" }); }
