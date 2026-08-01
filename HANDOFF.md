# 项目交接文档

> 供新对话接续本项目时快速上手。新会话应先完整读完本文件，再复述关键要点确认理解，然后再动手。

## 新窗口必须先确认的当前状态

- **本地项目目录**：`D:\project\outlook`。
- **GitHub 公开仓库**：`https://github.com/k-kedrick/outlook-mail-manager`。
- **服务器部署域名**：`https://outlook.2963wang.shop`，当前 `/login` 已公网验证 `HTTP/2 200`。
- **服务器部署目录**：`/opt/outlook-mail-manager`。
- **服务器容器名**：`outlook-mail-manager`。
- **服务器运行方式**：Docker Compose + Nginx 反向代理 + Let's Encrypt HTTPS，容器绑定 `127.0.0.1:3005->3005`。
- **服务器数据策略**：服务器是**空库部署**，不迁移本机 51 个真实账号。服务器数据只在 `/opt/outlook-mail-manager/data/dev.db`；删除 `data/` 就是删除服务器全部账号、卡密、验证码缓存和 2FA 数据。
- **公开发布策略**：GitHub 只放源码、脱敏截图、部署脚本和文档；绝不提交 `.env`、`data/`、`prisma/dev.db`、`*.db`、`*.bak`、真实导出文件、真实截图、日志。
- **当前推荐部署入口**：新用户直接执行 `sh deploy/scripts/install.sh`，脚本自动生成 `.env`、`APP_SECRET`、`docker-compose.yml`、`data/` 并启动容器。
- **当前访问模式**：
  - `reverse-proxy`：正式推荐，绑定 `127.0.0.1:3005`，用 Nginx/Caddy/宝塔/Cloudflare/HTTPS 访问。
  - `direct-ip`：测试可用，绑定 `0.0.0.0:3005`，用 `http://服务器IP:3005` 访问，但长期公网使用不推荐。
  - `local`：本地测试，绑定 `127.0.0.1:3005`。

## 给新窗口的工作原则

1. **先读完整个 `HANDOFF.md`，再复述关键护栏**。尤其要确认：本地真实数据库、`APP_SECRET` 风险、检测状态/刷新令牌分离、`/redeem` 只读取码、验证码正则误抓 `Enter` 已修复。
2. **默认先规划，经用户确认后再动手**。除非用户明确说“开始执行”或给出 “PLEASE IMPLEMENT THIS PLAN”。
3. **不要为了方便清库、改 `.env`、重置 Prisma、删除迁移或覆盖真实数据**。本地 `prisma/dev.db` 是真实账号库；服务器空库是另一回事，不要混淆。
4. **改业务逻辑必须验证真实行为**。只跑 `tsc` 不够；涉及导入、导出、取码、2FA、卡密、部署时，应结合页面、接口或脚本验证。
5. **涉及 RefreshToken 的改动要格外谨慎**。读信、取验证码、检测状态不应该被改成频繁 `forceRefresh`。
6. **涉及公开 GitHub 的改动要做敏感信息检查**。不得把真实邮箱、卡密、验证码、RefreshToken、2FA 密钥、`.env`、数据库或日志推上去。
7. **文档要跟代码同步**。如果改了部署方式、API 语义、安全边界、使用流程，要同步 `README.md` / `DEPLOY.md` / `SECURITY.md` / `HANDOFF.md`。

## 一句话简介

一个独立的 Next.js 后台，用来批量管理 Outlook / MSA 账号（`邮箱----密码----ClientId----RefreshToken` 格式导入）：读收件箱（含垃圾邮件）、抓验证码、检测账号状态、自动/手动刷新令牌防失效。**另外还带一套"卡密兑换 + 身份验证器(TOTP)"系统**：后台给账号生成一对一卡密，买家在公开页 `/redeem` 用卡密换取该账号的邮箱验证码和 TOTP 动态码。目录：`D:\project\outlook`。

## ⚠️ 重要提醒（务必先看）

- **数据库里已有 51 个真实账号**（`prisma/dev.db`），另有用户测试时建的少量真实卡密（`CardKey` 表）。任何"重置数据库 / 清库 / 删迁移重建"之类的操作，**动手前必须先跟用户确认**。改 schema 一律走**纯增量迁移**（可空列/新表），迁移前先 `cp prisma/dev.db prisma/dev.db.bak` 兜底。
- `.env` 的 `APP_SECRET` 一旦更改，**已加密存储的密码/RefreshToken/2FA密钥 会全部报废、无法解密**，改之前要三思。
- **管理员登录密码现在可在「设置」弹窗里修改**：改后以 scrypt 哈希存 `AppConfig.adminPasswordHash`，**优先于** `.env` 的 `ADMIN_PASSWORD`；该列为空时回退用 env 口令。想恢复 env 口令就把这列置 null。注意 session 是无状态 HMAC，改密不会踢掉已登录会话。
- 本项目现在已经是 git 仓库，并已公开推送到 `https://github.com/k-kedrick/outlook-mail-manager`。公开仓库不包含 `.env`、真实数据库、日志或真实导出文件。
- 服务器部署现在默认走**空库 Docker 一键部署**，不迁移本机 51 个账号；服务器数据在 `/opt/outlook-mail-manager/data/dev.db`，删除 `data/` 就会删除服务器上的账号、卡密、验证码缓存和 2FA 数据。
- **公开页 `/redeem` 只能走只读取码路径**（`fetchAndStoreCode`），**绝不能在里面调 `checkAccount`/keep-alive/`forceRefresh`**，否则破坏下面第四期的令牌轮换护栏。TOTP 是纯本地计算、不触网。

## 技术栈

Next.js 15 (App Router) · React 19 · TypeScript · Prisma + SQLite · Tailwind CSS。无测试框架，无 CI。

## 目录速览

```
src/
  app/
    api/accounts/…        账号相关路由（增删改查/导入/导出/检测/刷新/验证码）
      [id]/totp/route.ts   后台读某账号当前 TOTP（供抽屉展示，requireAuth）
    api/cardkeys/…         生成(generate) / 解绑(unbind) 卡密（requireAuth）
    api/redeem/…           公开兑换：route(校验+身份) / code(取邮箱验证码) / totp(取动态码)——均不 requireAuth
    api/auth/…             login / logout / password(改管理员密码)
    api/groups/…           分组
    api/settings/route.ts  AppConfig 读写（GET 会剔除 adminPasswordHash 不外泄）
    redeem/page.tsx        公开卡密兑换页（客户端，走 middleware 白名单放行）
    login/page.tsx  page.tsx  layout.tsx
  components/
    dashboard.tsx           主看板（目前最大、最核心的组件）
    account-drawer.tsx      账号详情抽屉（含卡密区 + 身份验证器实时倒计时区）
    import-dialog.tsx / groups-dialog.tsx / settings-dialog.tsx
    card-key-dialog.tsx     卡密管理弹窗（生成/覆盖生成/删除解绑）
    bulk-group-dialog.tsx   批量修改分组弹窗
    totp-dialog.tsx         批量管理身份验证器（添加/替换/删除 2FA）
    export-dialog.tsx       导出列勾选弹窗（账号/密码/clientId/刷新令牌/卡密/2FA密钥）
    ui/                     共享设计系统：button / badge / field / dialog / card
  lib/
    outlook/
      oauth.ts       令牌换取 + 轮换 + 5分钟节流护栏（核心，改动前务必先理解）
      mail.ts        三通道调度：Outlook REST 优先，Graph、IMAP OAuth2 兜底
      imap.ts        Outlook IMAP 993/TLS/OAuth2、UID 分页、特殊文件夹和正文解析
      health.ts      verifyStatus(只读检测) vs checkAccount(会轮换的保活检测)
      risk.ts        令牌 90 天有效期倒计时 + 三档风险色（剩余天数基于 refreshTokenExpiresAt）
      code-service.ts / codes.ts   验证码抓取（收件箱+垃圾邮件并发取最新）与正则提取
      keep-alive.ts  批量保活刷新
      scheduler.ts    应用内定时器（状态检测/令牌保活/验证码轮询三条独立分支）
      parse.ts        导入文本解析（4段 / 5段带2FA / 2段仅补2FA，三格式自动识别）
    totp.ts          RFC 6238 TOTP（base32解码 + HMAC-SHA1，无第三方依赖）
    cardkey.ts       卡密码生成（前缀 + 8位大写字母数字随机段）
    redeem.ts        卡密 → 账号 的解析（公开兑换用）
    settings.ts       AppConfig 读写封装 + setAdminPasswordHash
    auth.ts / session.ts / secrets.ts   登录会话 + AES-256-GCM 加密 + scrypt 密码哈希(hashPassword/verifyPasswordHash) + verifyAdminPassword
    serialize.ts      Prisma 记录 → 前端 JSON（含 cardKey / has2fa，绝不外泄密文）
  instrumentation.ts   Next 启动钩子，拉起 scheduler
  middleware.ts        登录态门禁（白名单放行 /redeem 与 /api/redeem*）
prisma/schema.prisma   MailAccount / MailGroup / AppConfig / CardKey
scripts/keep-alive.ts + .bat   脱离网站独立跑保活刷新，供 Windows 计划任务用
deploy/scripts/install.sh       空库优先 Docker 一键部署（反代 / IP直连 / 本地三种模式）
deploy/scripts/check-deploy.sh  部署健康检查（不打印密钥明文）
deploy/scripts/backup-sqlite.sh 服务器 SQLite 备份
deploy/nginx/app.example.conf   Nginx 反代模板
```

## 迭代历史（做了什么 / 为什么）

**第一期 · 基础管理系统**
账号 CRUD、批量导入解析（`----` 四段格式）、分组、搜索/筛选、加密存储（密码+RefreshToken 用 AES-256-GCM）、导出。

**第二期 · 保活与预警（后被第四期取代大半）**
最初做了"续期"概念——记录上次续期时间、按闲置天数给风险色、定时/手动续期。这一期的很多措辞和模型在第四期被重新设计，见下。

**第三期 · 关键 Bug 修复 + 令牌模型重做**
- **读信一直报 `AADSTS70000` 的根因**：这批账号的 client（如 `9e5f94bc-…`）**只授权了 `outlook.office.com` 资源、没授权 Graph**，且 Outlook **拒绝 IMAP XOAUTH2 登录**。原来的代码是"Graph 优先失败就报错"，根本没走到能用的路径。**修复：改用 Outlook REST API**（`https://outlook.office.com/api/v2.0/me/MailFolders/{Inbox|JunkEmail}/messages`），纯 HTTPS，绕开 IMAP 端口/协议问题；Graph 仅作为其他账号类型的兜底。账号首次读信成功后会记住协议（`mailProtocol` 字段），后续直接用。
- **令牌有效期模型**改为 90 天倒计时：每次成功刷新，`refreshTokenExpiresAt` 重置为"现在 + 90 天"（如果微软返回了 `refresh_token_expires_in` 就用真实值），前端按剩余天数显示绿/黄/红。
- 验证码抓取结果**缓存**到账号行（`lastCode` / `lastCodeAt` / `lastCodeSubject`），不用每次都现读。
- 引入 `AppConfig` 单例表（Prisma 里 `id="singleton"` 的一行），把"多久检测一次/多久刷新一次/是否轮询验证码"做成**运行时可调**，不再是 env 硬编码。

**第四期 · 防封号核心设计（最重要，改动前必读）**
用户指出"检测状态"和"刷新令牌"被我混为一谈了——MSA 的 RefreshToken **单次使用、每次刷新必轮换**，短时间大量轮换会触发微软风控导致锁号/封号。于是把两件事彻底分离：

| | 检测状态 (`verifyStatus`) | 刷新令牌保活 (`checkAccount`) |
|---|---|---|
| 是否轮换令牌 | **否**——复用缓存的 access token（~55分钟有效），只发一个只读探测请求 | **是**——强制 `forceRefresh`，必然轮换 |
| 安全频率 | 可以很频繁（默认每 6 小时，最低 5 分钟） | 必须低频（默认每 7 天，只刷"到期"的账号） |
| 代码位置 | `health.ts` 的 `verifyStatus` / `verifyStatuses` | `health.ts` 的 `checkAccount` / `checkAccounts`，`keep-alive.ts` |
| API | `POST /api/accounts/check-status` | `POST /api/accounts/keep-alive`、`POST /api/accounts/[id]/check` |

外加一道硬护栏：`oauth.ts` 里 `MIN_ROTATION_INTERVAL_MS`（5 分钟）——**任何路径**对同一账号在 5 分钟内不会重复打令牌端点，防连点/并发定时器同时触发。这是本项目最容易被"顺手改坏"的地方，改 `oauth.ts` 或调度器前一定要理解这张表。

**近期（第五期，无正式编号）**
- 工具栏"全部操作 vs 所选操作"视觉去重：勾选账号后顶部的"检测全部/刷新全部令牌/获取全部验证码/导出全部"自动隐藏，改用居中操作条统一切换成"…所选"，不再上下重复。
- 每页显示数量可自定义（分页大小从固定 50 改成用户可填 1–1000，存 localStorage）。
- UI 全面重做：引入 `src/components/ui/`（Button / Badge(StatusBadge, RiskBadge, Pill) / Field / Dialog / Card）设计系统，主题定为**靛蓝(indigo) accent + 青绿(teal) 点缀**的深色系（`tailwind.config.ts` + `globals.css` 里的 CSS 变量）。分组取色板换成同色调层级、绕色轮均匀分布的一组（indigo/teal/sky/green/amber/rose/purple/slate），替换了之前不成体系的配色。**后续任何 UI 改动都应该复用这套组件和取色板**，不要另起样式。

**第六期 · 科技感 UI + 垃圾邮件合并 + 卡密兑换系统 + 2FA(TOTP)**
- 科技感 UI 增强：标题渐变发光文字（`.text-glow-title`）、卡片辉光边框（`shadow-glow`）、主按钮 hover 辉光、Pill/徽章配色加浓。全部在既有 indigo/teal 体系上增量，未换配色。
- 工具栏"检测全部…"那排改左对齐去外框；账号详情抽屉的"读取收件箱"改为**合并展示收件箱+垃圾邮件**（`fetchInboxAndJunk`，`Promise.allSettled` 并发、垃圾箱失败静默降级），垃圾邮件条带琥珀色角标；验证码抓取也从"Inbox优先/Junk兜底"改成"两个文件夹并发、按时间取真正最新一封"。
- **卡密兑换系统**：新增 `CardKey` 表（一对一绑账号、`code` 唯一、可重复使用）。后台勾选账号→生成卡密（前缀自定义 + `-` + 8位大写字母数字，唯一冲突自动重试），可重新生成/取消绑定；搜索栏支持邮箱与卡密**混搜**（`accounts` 路由 where 用 `AND` 合并，修掉了 `q` 与 `需刷新` 抢 `where.OR` 的隐患）。
- **公开兑换页 `/redeem`**：不需管理员登录，卡密即凭证（middleware 白名单）。输入卡密→显示对应邮箱、邮箱验证码(可复制)、验证码时间、身份验证器动态码(`码 | 剩余秒`，30秒滚动)。三个公开接口 `/api/redeem`、`/api/redeem/code`、`/api/redeem/totp`**只回安全字段、绝不返回密码/ClientId/RefreshToken**，且只走只读取码路径。
- **身份验证器(TOTP)**：`src/lib/totp.ts` 用 Node 内置 crypto 自实现 RFC 6238（无第三方依赖），已用 RFC 官方测试向量验证过；密钥复用 `encryptSecret` 加密存 `MailAccount.totpSecretCipher`。导入弹窗**同一个窗口**支持三格式（按段数自动识别）：`账号----密码----clientid----刷新令牌`(4段)、`…----刷新令牌----2FA密钥`(5段)、`账号----2FA密钥`(2段，仅给已存在账号补2FA、不动凭证)。

**第七期 · 六项打磨（当前最新，已验证）**
1. **"上次刷新时间"语义修复（重要）**：`oauth.ts` 的 `getAccessToken` 原来只要做 token exchange 就无条件写 `refreshTokenUpdatedAt`，导致读操作（取验证码/读信/检测）在冷缓存下轮换 access token 时误改"上次刷新时间"。**已改为仅 `forceRefresh` 时才写 `refreshTokenUpdatedAt`**；读触发的轮换仍写 `refreshTokenCipher`（保令牌可用），但不动"上次刷新时间"。→ 该列现在**只反映显式「刷新令牌」/保活**。注意 `keep-alive.ts` 的陈旧度筛选就是基于 `refreshTokenUpdatedAt`，此改动让它更准（不再被读操作误判"新鲜"）。（**注**：本条当时仍保留"读触发轮换写 `refreshTokenExpiresAt`"，第十期已一并去除，见下。）
2. 选中操作条按钮改名：检测账号 / 刷新令牌 / 获取验证码 / 生成卡密 / 导出 / 删除。
3. 删掉无选中态的"检测全部/刷新全部令牌/获取全部验证码/导出全部"四个批量按钮（要全量先用表头全选）。
4. **导出重做**：`导出` 打开列勾选弹窗（账号/密码/clientId/刷新令牌/卡密/2FA密钥），后端 `accounts/export` 按 `?fields=` 白名单取列、**按固定列序**用 `----` 拼接、**空字段输出字面量 `error`**、**严格按邮箱升序**（`orderBy email asc`，Prisma `in` 不保序所以靠它定序）。
5. 删掉右上"导出卡密"独立按钮及其路由（卡密并入第4点的可选列）。
6. **管理员改密**：`AppConfig` 加 `adminPasswordHash`（scrypt，随机salt、不用APP_SECRET派生）；`auth.ts` 新增 `verifyAdminPassword`（有hash用hash、否则回退env）；`/api/auth/password` 改密（校验当前密码）；`settings` GET/PUT 剔除该hash不外泄；设置弹窗标题「定时任务设置」→「设置」，底部加"修改管理员密码"区。

**第八期 · 取码、2FA、批量管理与 UI 收尾（已验证）**
1. **验证码正则误抓 `Enter` 已修复**：`codes.ts` 现在数字验证码优先，允许 `code` 与真实数字之间夹短引导词；通用字母数字码不再大小写放宽，避免把 `Enter` / `Your` 当验证码。已用 ChatGPT `736276`、中文 `208857`、英文 `123456`、大写字母数字 `AB12CD` 样本验证。
2. **导出所选顺序已修复**：带 `ids` 导出时按前端传入 id 顺序输出；无 ids 时仍按邮箱升序。
3. **列表排序改为导入/创建顺序**：账号列表按 `createdAt asc` 显示，后续追加导入会排在已有账号后面。
4. **2FA 管理补齐**：主列表新增 2FA 状态列；选中操作条可批量添加/替换/删除 2FA；账号抽屉支持单账号添加/替换/删除 2FA；单账号设置接口只更新 `totpSecretCipher`。
5. **卡密管理补齐**：批量卡密弹窗支持删除/解绑所选账号卡密；账号抽屉原有单账号解绑保留。
6. **批量分组补齐**：选中操作条新增「分组」，可批量移动到已有分组或设为未分组，只更新 `MailAccount.groupId`。
7. **表头选择与操作区优化**：选中操作区固定占位，搜索/筛选/表格不再跳动；表头选择框支持当前可见列表的全选/反选/取消，并保留三态 UI。
8. **TOTP 轮询降噪与导出提示**：账号抽屉和 `/redeem` 页面隐藏时暂停 TOTP rollover 请求，恢复可见时再取一次；导出弹窗勾选 RefreshToken 或 2FA 密钥时显示敏感字段提示。

> 注：**第九期（导出行序修复）** 在另一条分支 / PR（`fix/export-row-order`）里，本 PR 不含；两者独立，合并顺序不影响代码。

**第十期 · "令牌有效期"只跟显式刷新走（本 PR，已验证）**
- **现象**：点"获取验证码"后，某账号"令牌有效期"跳回 90 天，但"上次刷新"没变；截图里所有账号"上次刷新"都是同一时刻，"令牌有效期"却有 89/90 差异。
- **根因**：`oauth.ts` 的 `getAccessToken` 里，`refreshTokenExpiresAt`（驱动"令牌有效期"）在**任何一次成功 token 交换**时都被重置为"现在+90天"，包括读操作（取验证码/读信/冷缓存检测状态/公开 `/redeem` 取码）在缓存过期时触发的轮换。而 `refreshTokenUpdatedAt`（"上次刷新"）第七期起只在 `forceRefresh` 写。两字段被读操作拆开，导致"令牌有效期"被读操作静默重置。同一根因还影响列表「需刷新」筛选（`accounts/route.ts` 按 `refreshTokenExpiresAt`）和 `keep-alive.ts` 保活筛选（按 `refreshTokenUpdatedAt`）——两套字段本应一致却被读操作拆开。
- **修复**：`refreshTokenExpiresAt` 与 `refreshTokenUpdatedAt` 一样，**只在 `forceRefresh`（显式「刷新令牌」/保活）时才写**。读操作仍持久化轮换后的 `refreshTokenCipher`（否则令牌失效），但不碰这两个展示/策略字段。改后"令牌有效期""上次刷新""需刷新筛选""保活筛选"四处全部只跟"显式刷新/导入"走，完全一致。
- **权衡（重要，记住别当 bug）**：改后"令牌有效期"是**保守下界**——只靠"取验证码"续命、从不显式「刷新令牌」的账号，即使真实令牌因读操作一直在轮换、并未失效，"令牌有效期"仍会从导入时刻起倒数、最终显示危险；点一次「刷新令牌」即恢复 90 天。这是刻意的（符合"有效期只和刷新令牌有关"的语义，且偏保守=更安全），不是新 bug。
- **验证**：mock `fetch`（不触网、不轮换真实令牌）+ 拦截 `prisma.update`（不写库）跑真实 `getAccessToken`：读路径不写 `refreshTokenExpiresAt`/`refreshTokenUpdatedAt`、仍写 access token 缓存与轮换后的 `refreshTokenCipher`；`forceRefresh` 路径写两字段且有效期≈90天。`tsc --noEmit` 通过。

## 已知遗留问题 / 维护项（新会话别重新"发现"一遍）

0. **验证码正则误抓 `Enter` 已修复**：不要再把它当成未修 bug。后续如再改 `codes.ts`，必须保留 ChatGPT `Enter this temporary verification code to continue: 736276` 返回 `736276` 的样本验证。
1. `imapflow` 已用于第三套 IMAP OAuth2 取件通道，不可移除；正文通过服务器 MIME `BODYSTRUCTURE` 精确下载文本部分，不下载附件。服务器需允许出站访问 `outlook.office365.com:993`。
2. `.env` 里的密钥/口令是开发期弱值，真要给别人用或长期跑，需要换成强随机值（换 `APP_SECRET` 前一定记得会导致旧密文全部失效，见上方提醒）。
3. 没有任何自动化测试（没有 `*.test.ts`），所有验证都是本轮对话里手写临时脚本跑出来的（验证完会删掉）。如果后续加测试，优先覆盖验证码提取、导入解析、导出字段、TOTP 生成。
4. **`prisma/dev.db.bak` 备份文件**：第六/七期迁移前留的 SQLite 备份，占空间但无害；确认新功能都稳了可以删。
5. **`totpSecretCipher` / 卡密码是敏感数据**：导出（`accounts/export`）会解密导出 2FA 密钥明文、卡密也是明文——这是刻意的（管理员导出用），但注意别把导出接口暴露到公网。公开的 `/api/redeem*` 已严格只回 email+验证码+TOTP，不回这些。
6. **公开部署主线已改为空库 Docker 一键部署**：`sh deploy/scripts/install.sh` 会生成 `.env` 和实际 `docker-compose.yml`，自动创建空库并启动容器。不要再把服务器部署默认写成本机 51 个账号迁移流程；迁移旧数据库只属于高级场景。

## 如何启动 / 验证

```bash
cd D:\project\outlook
npm run dev                 # http://localhost:3005；后台登录口令见 .env 的 ADMIN_PASSWORD（若曾在设置里改过则以 DB 里的 hash 为准）
                            # 公开兑换页：http://localhost:3005/redeem（无需登录，用卡密进入）
npx tsc --noEmit             # 改完代码务必跑一次类型检查
npx prisma studio             # 图形化查库（小心别误删数据）
```

服务器空库部署验证：

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
sh deploy/scripts/install.sh
bash deploy/scripts/check-deploy.sh
```

之前会话验证接口/逻辑的习惯做法：在项目根目录写临时 `scratch_*.ts` 脚本（用 `npx tsx` 跑，`import "dotenv/config"` 后能直接 `import` 项目里的 `src/lib/*`、直连 prisma 与真实接口），验证完当场删除，不要污染项目。避免用系统 `/tmp` 路径（Windows 下 Node 对 `/tmp` 解析有坑）。验证公开接口可直接 `curl localhost:3005/api/redeem*`（无需 cookie）；验证需登录的接口可用 `curl -c/-b` cookie jar 先打 `/api/auth/login`。

改动 Prisma schema 后 `prisma generate` 报 `EPERM`（文件被占用），是 `next dev` 占着 `query_engine` DLL——**先停 dev server 再 `migrate`/`generate`，完成后重启**。本项目走 `prisma migrate dev`（有 migrations 历史），迁移一律纯增量（可空列/新表），迁移前先备份 `dev.db`。迁移+删路由后如果 tsc 报 `.next/types/...` 找不到已删路由，删掉对应 `.next/types/app/...` 陈旧生成物即可。

## 这次对话里体现出的协作习惯（供新会话参考）

- 用户习惯**中文**交流。
- 对安全边界很敏感，会主动追问"这样做会不会有风险"（比如追问轮换令牌频率会不会封号）——涉及外部账号安全/风控的改动，要主动讲清楚原理和风险，而不是简单说"做好了"。
- 喜欢让我在完成任务后**主动复盘"还有什么遗漏"**，而不是等他发现。
- UI 反馈会给**截图并圈出具体位置**，指出的问题要逐条对应回复、逐条修。
- 偏好先规划、经确认后再动手（这也是为什么大部分改动都走了 plan mode）。
- 每次改动后期望**用真实数据/真实请求验证**，而不是只看 `tsc` 通过就算完事。

## 新窗口对接话语（直接复制）

下面这段可以直接复制到新的 Codex 窗口作为开场：

```text
接手 D:\project\outlook 这个 Outlook 邮箱管理项目继续优化。

请你先完整读取 D:\project\outlook\HANDOFF.md，然后用你自己的话复述关键要点，确认理解后先不要动代码，等我告诉你这次具体优化什么。

当前项目状态：
1. 本地项目目录是 D:\project\outlook。
2. GitHub 公开仓库是 https://github.com/k-kedrick/outlook-mail-manager。
3. 项目已经部署到服务器，域名是 https://outlook.2963wang.shop，服务器目录是 /opt/outlook-mail-manager，Docker 容器名是 outlook-mail-manager。
4. 服务器部署走空库 Docker 一键部署，不迁移本机 51 个真实账号；部署脚本是 sh deploy/scripts/install.sh，检查脚本是 bash deploy/scripts/check-deploy.sh。
5. 公开仓库只允许提交源码、文档、脱敏截图和部署脚本，不能提交 .env、data/、prisma/dev.db、*.db、*.bak、日志、真实导出文件或真实截图。

必须严格遵守的安全护栏：
1. 本地 prisma/dev.db 里有 51 个真实账号 + 真实卡密数据，不能随便清库、重置、删迁移或覆盖。改 schema 只能走纯增量迁移，迁移前先备份 dev.db。
2. .env 的 APP_SECRET 不能随便改；一改会导致本地已加密的密码、RefreshToken、2FA 密钥全部无法解密。
3. “检测状态”和“刷新令牌”是两个完全不同的操作。MSA RefreshToken 每次刷新都会轮换，频繁轮换会触发风控；不要破坏 oauth.ts 的 5 分钟轮换护栏。
4. 公开兑换页 /redeem 只能读取邮箱验证码和本地计算 TOTP，绝不能在里面调用 checkAccount、keep-alive 或 forceRefresh。
5. 列表里的“最新验证码 / 验证码时间”是邮箱验证码，不是 2FA 动态码。
6. 验证码正则误抓 ChatGPT 邮件里的 Enter 这个 bug 已经修复，不要当成新发现；如果再改 codes.ts，必须保留 ChatGPT 样本 Enter this temporary verification code to continue: 736276 返回 736276。

协作方式：
1. 先规划，经我确认后再动手；如果我明确说“开始执行”或 “PLEASE IMPLEMENT THIS PLAN”，再直接实现。
2. 改完不要只跑 tsc；涉及业务的改动要尽量用真实页面、真实接口或真实数据验证。
3. 涉及 GitHub 发布、部署、截图、导出时，要主动检查敏感信息泄露风险。
4. 如果发现文档和代码不一致，优先核对真实代码/运行状态，然后同步更新 README.md、DEPLOY.md、SECURITY.md、HANDOFF.md。
5. 回答和说明用中文，尽量具体、直接，不要泛泛而谈。

读完 HANDOFF.md 后，先复述你理解的关键点，尤其是 GitHub/服务器部署状态、本地真实数据库保护、RefreshToken 护栏、/redeem 边界、公开发布敏感信息规则。
```
