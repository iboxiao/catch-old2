# 代码说明

本文档说明 `捉老二 Catch The Second` 的主要代码结构，方便后续维护和二次开发。

## 入口

### `server/index.ts`

项目使用自定义 Node 服务启动 Next.js，同时挂载 Express 和 Socket.io。

主要职责：

- 启动 Next.js 页面服务
- 提供 `/health` 健康检查接口
- 管理 Socket.io 连接
- 在内存中保存房间、玩家、手牌、分牌和结算结果
- 处理创建房间、加入房间、准备、开始、提交分牌、亮牌、再来一局等事件

### `app/page.tsx`

游戏的主界面。当前是单页应用式体验，根据房间状态切换不同视图。

主要视图：

- 进入游戏：创建房间 / 加入房间
- 房间等待：玩家列表 / 准备状态
- 分牌：手牌区、三轮牌组、倒计时、提交按钮
- 结算：三轮亮牌结果、处罚杯数
- 战绩：杯数、第二名次数、爆牌次数、胜局数

移动端做了专门优化：

- 窄屏下按钮和表单单列显示
- 扑克牌尺寸适配手机宽度
- 支持“点牌 -> 点目标区域”的触控分牌方式
- 提交按钮在手机分牌页底部固定

## 共享规则模块

### `src/shared/types.ts`

前后端共用类型定义，包括：

- `Card`
- `SplitSubmission`
- `RoomSnapshot`
- `RoundResult`
- Socket.io 客户端和服务端事件类型

### `src/shared/rules.ts`

扑克规则核心模块。服务端结算和测试都依赖这里。

主要函数：

- `buildDeck()`：生成 52 张标准扑克牌
- `shuffle()`：洗牌
- `validateSplit()`：校验 1/2/3 分牌是否合法
- `makeAutoSplit()`：超时自动分牌
- `evaluateSingle()`：第一轮单牌比大小
- `evaluateTenHalf()`：第二轮十点半
- `evaluateThreeCard()`：第三轮飘三叶/炸金花
- `scoreRound()`：统一计算每轮第一档、第二名、爆牌和处罚杯数

### `src/shared/rules.test.ts`

规则测试，覆盖：

- 单牌第二名判定
- 十点半爆牌排除逻辑
- A23 / AKQ / 235 特殊牌型
- J/Q/K 在十点半中按 0.5 计算

## 实时事件

服务端支持的主要 Socket.io 事件：

```text
createRoom
joinRoom
ready
startGame
submitSplit
revealNext
playAgain
```

服务端向客户端推送：

```text
roomState
toast
```

`roomState` 是前端渲染游戏状态的核心数据源。每名玩家收到的 `roomState` 都只包含自己的手牌，避免看到其他人的暗牌。

## 内存模型

V1 不接数据库，所有房间数据都保存在服务端内存中。

因此：

- 服务重启后房间会清空
- 不支持多实例横向扩容
- 适合 V1 小规模聚会使用

如果后续要上线到多人长期使用，建议增加：

- Redis：保存房间状态，支持多实例
- 数据库：保存用户、历史战绩和房间记录
- 鉴权：手机号、微信或游客 token

## 部署

项目已提供：

```text
Dockerfile
docker-compose.yml
deploy/nginx.conf.example
DEPLOY.md
```

推荐部署方式是 Docker Compose。详见 `DEPLOY.md`。

