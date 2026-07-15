# 部署说明

本项目是 Next.js + Prisma + SQLite 的服务端应用，包含 API Routes、SQLite 数据库、后台定时器和公开兑换页。GitHub 适合存放源码；完整功能需要部署到支持 Node.js 的服务器。

## 不适合的部署方式

- **GitHub Pages**：只能托管静态文件，不能运行 Next API、Prisma、SQLite 或后台定时任务。
- **当前架构直接上 Vercel**：SQLite 不适合 serverless 文件系统持久写入；如需 Vercel，建议先迁移到 PostgreSQL/MySQL 等外部数据库。

## Docker 一键部署（空库优先，推荐）

默认按空数据库部署，不迁移任何旧账号数据。安装脚本会生成 `.env`、生成实际 `docker-compose.yml`、创建 `data/`、启动容器并等待健康检查。

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
sh deploy/scripts/install.sh
```

脚本会让你选择访问方式：

- `reverse-proxy`：推荐，绑定 `127.0.0.1:3005`，再用 Nginx/Caddy/面板反代并开启 HTTPS。
- `direct-ip`：绑定 `0.0.0.0:3005`，可直接访问 `http://服务器IP:3005`。
- `local`：绑定 `127.0.0.1:3005`，只适合本机测试。

脚本会自动生成 `APP_SECRET`；你只需要按提示选择访问方式/公网地址，并输入后台密码。脚本不会把密钥或密码打印出来。

### 反代 + HTTPS 示例

你的服务器如果使用 `outlook.2963wang.shop`：

```bash
cd /opt
git clone https://github.com/k-kedrick/outlook-mail-manager.git
cd outlook-mail-manager
APP_DOMAIN=outlook.2963wang.shop INSTALL_NGINX=1 sh deploy/scripts/install.sh
```

脚本会写 Nginx 配置、执行 `nginx -t` 并 reload。HTTPS 仍建议手动执行：

```bash
certbot --nginx -d outlook.2963wang.shop
```

### IP 直连示例

不用反代时选择 `direct-ip`，或直接指定：

```bash
ACCESS_MODE=direct-ip sh deploy/scripts/install.sh
```

这种方式会开放 `0.0.0.0:3005`。正式环境建议只用于临时测试，长期使用优先 HTTPS 反代。

### 本地测试示例

```bash
ACCESS_MODE=local sh deploy/scripts/install.sh
```

访问 `http://localhost:3005`。

## 高级手动部署

### Linux / VPS Node 部署

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

### Windows 服务器部署

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

### Docker 手动流程

如果不想用一键脚本，可以手动生成配置：

```bash
cp docker-compose.example.yml docker-compose.yml
sh deploy/scripts/setup-env.sh
docker compose up -d --build
bash deploy/scripts/check-deploy.sh
```

第一次构建会比较慢，`Building 13/19`、`exporting layers`、`docker:default` 都是正常进度，不是错误；看到 `Container outlook-mail-manager Started` 才算启动完成。

```bash
docker compose up -d --build
docker compose ps
docker logs outlook-mail-manager --tail=100
```

如果误按 `Ctrl+C` 中断构建，后面可能没有容器，`docker compose ps` 会是空的；重新执行 `docker compose up -d --build` 并等待完成即可。

需要排查的典型字样是：`ERROR`、`failed`、`CANCELED`、`Restarting`。其中 `Restarting` 通常需要看日志：

```bash
docker logs outlook-mail-manager --tail=100
```

本机测试：

```bash
curl -I http://127.0.0.1:3005/login
curl -I http://127.0.0.1:3005/redeem
```

也可以使用内置检查脚本。脚本不会打印 `.env` 中的密钥值，只检查是否仍是默认值：

```bash
bash deploy/scripts/check-deploy.sh
```

Nginx 反代示例已放在 `deploy/nginx/app.example.conf`，可复制到 `/etc/nginx/sites-available/<your-domain>`，并把 `server_name` 改成你的域名：

```nginx
server {
    server_name mail.example.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

首次部署后再用 Certbot 或面板为你的域名申请 Let's Encrypt 证书。

## 删除并重新空库部署

以下命令会删除 Outlook 项目容器、镜像、项目目录和 `data/` 数据库：

```bash
cd /opt/outlook-mail-manager 2>/dev/null && docker compose down --remove-orphans || true
docker rm -f outlook-mail-manager 2>/dev/null || true
docker rmi outlook-mail-manager-outlook-mail-manager 2>/dev/null || true
rm -rf /opt/outlook-mail-manager
```

## 更新

```bash
cd /opt/outlook-mail-manager
git pull
docker compose up -d --build
```

### 更新后代码没生效？强制不走缓存重建

个别服务器的 Docker 用的是旧版 builder（构建时会提示 `Docker Compose is configured to build using Bake, but buildx isn't installed`）。这种情况下 `docker compose up -d --build` 的 `COPY . .` 缓存判定可能失灵——即使 `git pull` 已经拉到新代码，构建仍全程命中缓存、产出**和上次字节相同的旧镜像**，于是更新看似成功、实则容器仍在跑旧代码。

判断方法：看构建日志结尾那行 `exporting manifest sha256:`。如果它和上次构建**完全一样**，且 `COPY . .` / `npm run build` 都显示 `CACHED`，就是踩到了这个坑。

解决：强制不走缓存重建（数据库在挂载的 `data/`，重建不受影响）：

```bash
cd /opt/outlook-mail-manager
docker compose build --no-cache
docker compose up -d
docker compose ps                       # 期望 Up (healthy)
curl -I http://127.0.0.1:3005/login     # 期望 200
```

重建后 `exporting manifest sha256:` 应变成一个**新值**，即代表新代码已真正编入镜像。`--no-cache` 会重跑 `npm ci` 与 `npm run build`，比普通更新慢几分钟属正常，别中途按 `Ctrl+C`。

## 数据备份

```bash
cd /opt/outlook-mail-manager
bash deploy/scripts/backup-sqlite.sh
```

## `.env` 安全提醒

- 不要把 `.env`、`APP_SECRET`、`ADMIN_PASSWORD`、RefreshToken、2FA 密钥、卡密或真实账号截图贴到公开聊天、GitHub issue 或 README。
- 空库部署时，如果 `APP_SECRET` 或后台密码泄露，可以直接重新生成并修改 `.env`，然后 `docker compose restart`。
- 已经导入真实账号后，不要随便改 `APP_SECRET`；它用于解密密码、RefreshToken 和 2FA 密钥，改掉会让已有密文不可读。
- 如果只是后台密码泄露，可以只改 `ADMIN_PASSWORD`，或登录后台后在设置中修改管理员密码。

## 迁移和数据

- 公开仓库不包含真实 `prisma/dev.db`。
- Docker 空库部署会在容器启动时自动执行 `npx prisma migrate deploy` 创建结构。
- 已有真实数据库迁移到服务器时，手动安全传输 `prisma/dev.db`，不要通过 GitHub 上传。
