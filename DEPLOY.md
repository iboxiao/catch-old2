# 部署说明

本文档说明如何把 `捉老二 Catch The Second` 部署到云服务器。

项目特点：

- 前端：Next.js
- 后端：Express + Socket.io
- 运行方式：自定义 Node 服务
- 默认端口：`3000`
- V1 数据存储：服务器内存

推荐生产环境使用 **Docker Compose + Nginx + HTTPS**。如果服务器不方便装 Docker，也可以使用纯 Linux Node 环境部署。

## 方式一：Docker Compose 部署（推荐）

### 1. 准备服务器

推荐系统：

- Ubuntu 22.04 LTS
- Ubuntu 24.04 LTS

云服务器安全组需要放行：

```text
22    SSH 登录
80    HTTP
443   HTTPS
3000  调试端口，可选；正式上线后建议关闭公网访问
```

### 2. 安装 Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

确认安装成功：

```bash
docker --version
docker compose version
```

### 3. 拉取代码

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone git@github.com:iboxiao/catch-old2.git
sudo chown -R $USER:$USER /opt/catch-old2
cd /opt/catch-old2
```

如果服务器没有配置 GitHub SSH key，也可以用 HTTPS：

```bash
git clone https://github.com/iboxiao/catch-old2.git
```

### 4. 启动服务

项目已经提供 `docker-compose.yml`，直接执行：

```bash
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

此时可以访问：

```text
http://服务器IP:3000
```

### 5. 停止和重启

停止：

```bash
docker compose down
```

重启：

```bash
docker compose restart
```

重新构建并启动：

```bash
docker compose up -d --build
```

### 6. 更新代码

```bash
cd /opt/catch-old2
git pull
docker compose up -d --build
```

清理旧镜像：

```bash
docker image prune -f
```

## 方式二：纯 Linux Node 环境部署

如果不使用 Docker，可以直接在服务器上安装 Node.js 运行。

### 1. 安装 Node.js

推荐 Node.js 22 LTS。

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

确认版本：

```bash
node -v
npm -v
```

### 2. 拉取代码

```bash
cd /opt
sudo git clone git@github.com:iboxiao/catch-old2.git
sudo chown -R $USER:$USER /opt/catch-old2
cd /opt/catch-old2
```

### 3. 安装依赖并构建

```bash
npm ci
npm run build
```

### 4. 启动生产服务

临时启动：

```bash
PORT=3000 HOSTNAME=0.0.0.0 npm run start
```

生产环境建议使用 PM2 托管：

```bash
sudo npm install -g pm2
PORT=3000 HOSTNAME=0.0.0.0 pm2 start npm --name catch-old2 -- run start
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 status
pm2 logs catch-old2
```

重启：

```bash
pm2 restart catch-old2
```

更新版本：

```bash
cd /opt/catch-old2
git pull
npm ci
npm run build
pm2 restart catch-old2
```

## 配置 Nginx 反向代理

无论使用 Docker 还是纯 Node，建议都用 Nginx 代理到 `127.0.0.1:3000`。

安装：

```bash
sudo apt update
sudo apt install -y nginx
```

新建配置：

```bash
sudo nano /etc/nginx/sites-available/catch-old2
```

内容参考：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/catch-old2 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

注意：这个游戏使用 Socket.io，必须保留：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

否则玩家可能能打开页面，但无法正常实时联机。

## 配置 HTTPS

域名 A 记录指向服务器 IP 后，安装 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后访问：

```text
https://your-domain.com
```

Certbot 默认会配置自动续期，可以检查：

```bash
sudo systemctl status certbot.timer
```

## 生产环境建议

### 1. 不要暴露公网 3000

正式上线后，安全组只开放：

```text
22
80
443
```

`3000` 只让 Nginx 在本机访问即可。

### 2. 单实例运行

V1 使用服务器内存保存房间状态，所以不要同时启动多个实例。

如果未来要多台服务器或多个容器实例，需要先接入 Redis 存房间状态。

### 3. 服务重启会清空房间

因为 V1 没有数据库，服务重启后：

- 房间会消失
- 当前游戏会中断
- 战绩不会持久保存

这符合 V1 设计。如果要长期保存战绩，需要增加数据库。

## 常见问题

### 页面能打开，但玩家无法实时同步

检查 Nginx 是否配置了 WebSocket：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 访问域名显示 502

检查应用是否启动：

```bash
docker compose ps
docker compose logs -f
```

或 PM2：

```bash
pm2 status
pm2 logs catch-old2
```

### 端口被占用

查看端口：

```bash
sudo lsof -i :3000
```

停止旧进程后再启动。

### 构建失败

先确认 Node 版本：

```bash
node -v
```

建议使用 Node.js 22 LTS。然后重新安装依赖：

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

