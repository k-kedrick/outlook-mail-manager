# 部署说明

本项目是 Next.js + Prisma + SQLite 的服务端应用，包含 API Routes、SQLite 数据库、后台定时器和公开兑换页。GitHub 适合存放源码；完整功能需要部署到支持 Node.js 的服务器。

## 不适合的部署方式

- **GitHub Pages**：只能托管静态文件，不能运行 Next API、Prisma、SQLite 或后台定时任务。
- **当前架构直接上 Vercel**：SQLite 不适合 serverless 文件系统持久写入；如需 Vercel，建议先迁移到 PostgreSQL/MySQL 等外部数据库。

## Linux / VPS 推荐部署

```bash
git clone <your-repo-url> outlook
cd outlook
npm ci
cp .env.example .env
```

编辑 `.env`：

```env
DATABASE_URL="file:./dev.db"
APP_SECRET="replace-with-a-long-random-secret"
ADMIN_PASSWORD="change-me"
```

初始化数据库并构建：

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

默认监听 `http://localhost:3005`。生产环境建议使用 Nginx、Caddy 或面板反代到 `localhost:3005`，并开启 HTTPS。

## Windows 服务器部署

```bat
git clone <your-repo-url> outlook
cd outlook
npm ci
copy .env.example .env
npx prisma migrate deploy
npx prisma generate
npm run build
npm start
```

长期运行可以使用 PM2、NSSM、Windows 服务或任务计划守护 `npm start`。

独立低频保活任务可使用：

```bat
scripts\keep-alive.bat
```

## Docker 部署方向

本仓库当前未内置 Dockerfile。后续如需 Docker，建议：

- 将 SQLite 文件挂载为 volume，避免容器重建丢数据。
- 将 `.env` 作为运行时环境变量或挂载文件提供。
- 在镜像构建阶段执行 `npm ci`、`npx prisma generate`、`npm run build`。
- 在容器启动阶段运行 `npm start`。

## 迁移和数据

- 公开仓库不包含真实 `prisma/dev.db`。
- 生产服务器第一次部署用 `npx prisma migrate deploy` 创建结构。
- 已有真实数据库迁移到服务器时，手动安全传输 `prisma/dev.db`，不要通过 GitHub 上传。

