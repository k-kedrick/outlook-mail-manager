# 项目架构

本项目保持单体部署，以清晰的模块边界替代不必要的微服务拆分。

## 分层与职责

- `src/app`：Next.js 页面和 HTTP Route Handler，只负责鉴权、参数验证、调用领域服务与构造响应。
- `src/components`：客户端交互与展示，不直接访问数据库或解密敏感字段。
- `src/lib/outlook`：Outlook/Graph、验证码、状态检查、令牌刷新和后台调度等领域逻辑。
- `src/lib/auth.ts`、`server-env.ts`、`rate-limit.ts`、`secrets.ts`：认证、运行配置、流量保护和加密安全边界。
- `src/lib/prisma.ts`、`settings.ts`：数据库连接和应用配置持久化。
- `prisma/migrations`：只允许向前、可审计的数据结构变更；部署由 `prisma migrate deploy` 执行。

## 关键不变量

- `APP_SECRET` 不随普通发布轮换，避免已有 AES-256-GCM 密文失效。
- API 列表响应不包含密码、Refresh Token 或 TOTP Secret 明文。
- Refresh Token 的轮换按账户串行，并受最短轮换间隔保护。
- 修改管理员密码会递增 Session 版本，使所有旧 Cookie 失效。
- 定时任务不可重入；公开兑换接口不返回内部异常原文。
- SQLite 数据目录必须持久化，发布前必须备份且禁止进入 Git。

## 发布边界

应用容器仅绑定 `127.0.0.1:3005`，Nginx 是唯一入口，Cloudflare 提供外层 TLS/CDN/限流。`GET /api/health` 是容器健康探针；它验证数据库但不暴露内部信息。
