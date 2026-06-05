# 捉老二 Catch The Second

`捉老二` 是一款 3-8 人实时联机扑克游戏。每名玩家获得 6 张牌，并拆分成 `1 张 / 2 张 / 3 张` 三组，依次进行三轮比拼。游戏目标不是争第一，而是避免成为每轮的“第二名”。

## 功能

- 昵称进入，无需账号
- 创建房间、房间号加入
- 3-8 人准备后开始
- 自动发牌
- 手机优先的分牌界面
- 支持拖拽分牌，也支持手机点选分牌
- 2 分钟倒计时，超时自动提交
- 三轮自动结算
- 杯数、第二名次数、爆牌次数、胜局数统计
- 再来一局

## 技术栈

- 前端：Next.js 15 + React 19 + TypeScript + TailwindCSS
- 后端：Node.js + Express + Socket.io
- 数据：V1 使用服务器内存，不接数据库
- 部署：Docker / Docker Compose

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

## 常用命令

```bash
npm run typecheck
npm run test
npm run build
```

## 项目结构

```text
app/                     Next.js 前端页面
server/                  Express + Socket.io 自定义服务
src/shared/              前后端共用类型与扑克规则
public/cards/            本地扑克牌 SVG 素材
scripts/                 素材导入脚本
deploy/                  Nginx 示例配置
DEPLOY.md                云服务器部署说明
CODE_OVERVIEW.md         代码结构说明
```

## 规则假设

- 第二名按“先找第一档，再找严格低于第一档的最高档”判定。
- 同档多人一起视为第二名并受罚。
- 第二轮十点半中，爆牌玩家直接 `+2 杯`，且不参与第二名计算。
- 第三轮使用常见炸金花踢脚规则：A 作为大牌参与同牌型比较，A23 为最小顺子，AKQ 为最大顺子，235 为特殊最小牌型。

## 素材来源

扑克牌素材来源记录在：

```text
public/cards/SOURCE.md
```

