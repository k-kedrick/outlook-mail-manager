# V2 架构与边界

## 模块化单体

```text
src/app/api/v2       HTTP 适配层：认证、Zod、响应映射
src/features         前端功能模块、TanStack Query、API Client
src/modules/*/domain 领域类型、规则和 Port
src/modules/*/application 用例与流程编排
src/modules/*/infrastructure Prisma、Graph、IMAP、REST 等适配器
src/shared           加密、数据库、日志、指标、审计、HTTP
src/worker.ts        Worker 组合根
```

Domain 不导入 Next.js、Prisma、HTTP 或具体 Provider。Application 不导入 Route Handler 或 Infrastructure；组合根负责注入。ESLint 在 CI 强制这些边界。

## OAuth 与 Token

- `OAuthGrant(GRAPH)` 只服务 `GRAPH_MAIL`。
- `OAuthGrant(OUTLOOK_IMAP)` 只服务 `IMAP_MAIL`。
- `IMPORTED_MULTI_RESOURCE` 兼容外部公共客户端 Token，但每个 Profile 仍有独立 Access Token Cache。
- Token Broker 使用进程内 Promise 合并和 PostgreSQL 60 秒刷新租约。事务同时更新轮换后的 Refresh Token、Grant 版本和 Access Token。
- `invalid_grant` 立即标记 `REAUTH_REQUIRED`；429 遵循 `Retry-After`；临时网络错误由任务队列退避。
- 不伪造“90 天有效期”。仅记录真实 `providerExpiresAt`、`lastRotatedAt`、`lastVerifiedAt` 和维护策略 `nextMaintenanceAt`。

## 邮件路由

默认顺序为 Graph → IMAP。只有存在已探测可用能力时，legacy REST 才进入候选。一次临时错误只回退当前请求；连续 3 次临时失败熔断 15 分钟；权限永久错误禁用能力。

邮件列表只取摘要，不下载附件。正文限制大小，HTML 在无权限 sandbox iframe 中展示。Graph nextLink、IMAP UIDVALIDITY/UID 和 Provider 标识都封装在带版本的加密 Cursor/Message ID 中。

## 任务与并发

Worker 用 `FOR UPDATE SKIP LOCKED` 领取任务，租约 60 秒并每 20 秒续租。默认最多 5 次重试：30 秒、2 分钟、10 分钟、30 分钟、2 小时。权限错误、禁用账号和 `invalid_grant` 不重试。

调度器每 6 小时使用账号已验证通道做一次轻量健康检查，每 24 小时重新探测完整协议能力；Token Maintenance 按 Grant 的 14 天维护策略入队，保留期清理每天执行一次。

验证码使用最长 10 分钟的 `CodeRequest`，每 10 秒重试，最多 60 次；不会对全部账号永久轮询。查询端必须同时持有随机 retrieval token。

## 安全与可观测性

- Argon2id 管理员密码；TOTP 密文；恢复码 HMAC；Session Token 仅存独立密钥计算的 HMAC-SHA-256。
- Session 绑定 `sessionVersion`，改密事务会递增版本并撤销所有 Session。
- AES-256-GCM 密文包含 Key ID，支持新 Key 写入和旧 Key 解密。
- 卡密只保存 HMAC、前缀和尾号。
- JSON 日志统一记录 request/job ID 与错误类别，禁止记录密码、Token、完整卡密、TOTP Secret 和验证码正文。
- `/internal/metrics` 在生产环境要求 Bearer Token，并应由 Nginx allowlist 限制。
- 配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 后，Web 与 Worker 启用 Node 自动插桩并通过 OTLP/HTTP 导出 traces；未配置时不建立外部连接。
