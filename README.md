# Outlook Mail Manager V2

单管理员、单租户的 Outlook / Microsoft 365 邮箱管理平台，面向约 500–10000 个账号。V2 采用模块化单体、Web/Worker 双进程和独立 PostgreSQL，不迁移旧 SQLite 账号数据。

## 架构

```text
Cloudflare → Nginx → web ─┐
                         ├→ PostgreSQL
                  worker ┘
```

依赖方向固定为 `HTTP/UI → Application Use Cases → Domain`，Infrastructure 通过 Port 接口接入。Graph 是新账号主通道，IMAP OAuth2 是正式回退；已经退役的 Outlook REST 只服务导入的历史 Token，且必须先探测成功。

核心能力：

- Microsoft Authorization Code + PKCE + OIDC，证书 `client_assertion`。
- Graph 与 IMAP 分开授权、分开保存 Grant 和 Access Token Profile。
- 批量导入 `email----password----clientId----refreshToken----totp`，逐行隔离失败。
- PostgreSQL 任务队列，使用租约、`FOR UPDATE SKIP LOCKED`、退避重试和 Worker 心跳。
- 收件箱与垃圾邮件分别分页；Provider ID/Cursor 使用加密版本载荷。
- 强密码、管理员 TOTP、一次性恢复码、服务端 Session、CSRF 和审计日志。
- 卡密只保存 HMAC；明文只在创建响应中出现一次。
- JSON 日志、Prometheus 指标、readiness/liveness 和可选 OTLP 配置。

详细边界见 [架构文档](docs/ARCHITECTURE.md)，生产步骤见 [部署文档](DEPLOY.md)，敏感数据规范见 [安全文档](SECURITY.md)。

## 本地开发

要求 Node.js 22–24、Docker 和 Docker Compose。

```bash
docker run -d --name outlook-v2-postgres-dev \
  -e POSTGRES_DB=outlook_v2 -e POSTGRES_USER=outlook \
  -e POSTGRES_PASSWORD=outlook_dev_password \
  -p 127.0.0.1:54329:5432 postgres:18-alpine

cp .env.example .env
# 将 DATABASE_URL 改为 postgresql://outlook:outlook_dev_password@127.0.0.1:54329/outlook_v2?schema=public
npm ci
npm run prisma:deploy
npm run dev
npm run dev:worker
```

访问 `http://localhost:3005`。首次启动输入 `ADMIN_BOOTSTRAP_PASSWORD`，随后设置至少 12 位管理员密码、绑定 TOTP 并离线保存恢复码。

## API

V2 成功响应：`{ data, meta: { requestId } }`；错误响应：`{ error: { code, message, requestId } }`。所有响应包含 `X-Request-Id`，敏感响应禁止缓存。

主要接口：

- `/api/v2/auth/*`：初始化、登录、登出、改密。
- `/api/v2/oauth/microsoft/*`：Graph/IMAP 两阶段授权。
- `/api/v2/accounts/*`：导入、列表、账号级重新授权、能力探测、邮件、导出。
- `/api/v2/jobs/*`：异步任务创建与查询。
- `/api/v2/redemptions/*`：10 分钟验证码任务和 TOTP。
- `/api/health/live`、`/api/health/ready`、`/internal/metrics`。

旧 `/api/redeem/*` 仅保留一个版本周期，并返回 `Deprecation` 与 `Sunset` 响应头。

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run build
npm audit --omit=dev
docker build --no-cache -t outlook-mail-manager:v2 .
```

`test:coverage` 对 Domain/Application 强制执行行与函数 85%、分支 75% 的 CI 门槛；`test:coverage:all` 生成包含 HTTP/UI/Adapter 的全仓趋势报告。Playwright 负责真实生产构建的浏览器冒烟测试。

真实 Microsoft E2E 需要一个个人账号和一个允许 IMAP 的 Microsoft 365 测试账号；不要在 CI 中保存真实 Refresh Token。
