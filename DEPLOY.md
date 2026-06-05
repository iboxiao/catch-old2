# 云服务器部署说明

推荐使用 Ubuntu + Docker 部署。这个项目是 Next.js 自定义服务器 + Express + Socket.io，容器内监听 `3000` 端口。

## 1. 准备服务器

购买云服务器后，建议选择 Ubuntu 22.04 或 24.04。安全组/防火墙至少放行：

- `22`：SSH 登录
- `80`：HTTP
- `443`：HTTPS
- `3000`：仅调试时需要；正式用 Nginx 代理后可以关闭公网 3000

安装 Docker：

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

## 2. 上传项目

在服务器上放到例如：

```bash
/opt/catch-the-second
```

可以用 Git 拉取，也可以把整个 `F:\code\zhuo2` 上传到服务器。

## 3. 启动

在项目目录执行：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f
```

此时可以访问：

```text
http://服务器IP:3000
```

## 4. 配置域名和 Nginx

如果要用域名访问，把域名 A 记录指向服务器 IP。

安装 Nginx：

```bash
sudo apt install -y nginx
```

参考 `deploy/nginx.conf.example` 新建站点配置：

```bash
sudo nano /etc/nginx/sites-available/catch-the-second
sudo ln -s /etc/nginx/sites-available/catch-the-second /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

注意：Socket.io 需要 `Upgrade` 和 `Connection` 这两个 WebSocket 代理头，示例配置里已经包含。

## 5. 配置 HTTPS

安装 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后访问：

```text
https://your-domain.com
```

## 6. 更新版本

上传或拉取新代码后：

```bash
docker compose up -d --build
```

如果要清理旧镜像：

```bash
docker image prune -f
```

