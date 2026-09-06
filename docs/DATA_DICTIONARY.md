# 数据字典与来源登记

## 权威数据

| 实体 | 存储 | 主键/幂等键 | 生命周期 | 说明 |
|---|---|---|---|---|
| 用户 `users` | PostgreSQL | `id`、手机号/用户名唯一 | 注册—停用—匿名化 | 身份与创作者收款配置 |
| 作品 `works` | PostgreSQL | `id` | 草稿—审核—上架/驳回 | 作品聚合信息；具体交付内容以版本为准 |
| 版本 `work_versions` | PostgreSQL | `id`、作品内版本号唯一 | 草稿—待审—批准/驳回 | 文件引用、SHA-256、独立审核状态 |
| 商品 `listings` | PostgreSQL | `id`、每作品唯一 | active/archived | `version_id` 只指向当前线上批准版本 |
| 订单 `orders` | PostgreSQL | `id`、`idempotency_key` | created—paid—delivered/refunded | 冻结成交时作品、版本、价格、币种和许可 |
| 支付尝试 `payment_attempts` | PostgreSQL | `id`、支付幂等键 | created—succeeded/failed | 每次渠道交互独立留痕 |
| 权益 `entitlements` | PostgreSQL | `id`、同用户作品仅一个 active | active/revoked | 退款只撤销，不删除历史 |
| 退款 `refunds` | PostgreSQL | `id`、每订单唯一 | created—succeeded/failed | 对应一次账本冲正 |
| 账本 | PostgreSQL | 业务引用唯一 | 只追加 | 每组分录借贷相等，金额均为整数分 |
| 结算 `settlements` | PostgreSQL | `id`、幂等键 | pending—processing—paid/failed | 创作者结算批次，不覆盖原账本 |
| 文件 `stored_files` | PostgreSQL + 文件卷 | `id`、storage_key | 上传—扫描—引用—软删除 | 数据库保存元数据和哈希，文件卷保存字节 |
| 行为事件 `events` | PostgreSQL | `id`、可选 dedupe_key | 追加—到期清理 | 产品漏斗，不作为交易事实来源 |

## 辅助和演示数据

- D1：只保存愿望池、投票和需求分析等匿名增长数据，不能产生订单、权益或财务事实。
- 浏览器状态：仅保存当前页面、表单草稿、toast 等 UI 状态。
- 首页和作品广场：使用 `/v1/marketplace` 的真实已审核上架数据。
- 企业采购、示例创作者、路径教学：目前仍是产品原型数据，不得用于财务或运营报表。

## 金额与时间

- 所有金额使用整数分 `*_cents`；佣金使用基点 `PLATFORM_FEE_BPS`，10000 基点等于 100%。
- 数据库时间使用带时区时间戳并写入 UTC；展示层再转换为用户时区。
- 不从标题、URL 或前端展示文字反推交易事实。
