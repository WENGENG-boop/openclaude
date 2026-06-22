# Weo 终端改造 —— 现状与差距评估

> 目标:把这套 Claude Code 底层代码改造成**原生的 Weo 终端**。功能与 Claude Code 完全一致,
> 但模型后端只走 Weo 自己的第三方平台(基于 New API,部署在 VPS),**只支持 Weo 一个 provider 和 Weo 的 API key**,
> 用户可直接用 Weo 平台账号登录并共享额度。
>
> - Base URL:`https://api.weo.asia/v1`(Anthropic SDK 兼容)
> - 登录 + 额度同步:通过 New API(经 Weo auth bridge 桥接)
>
> 本文档对照该目标盘点:**已完成 / 部分完成 / 还差什么**,并给出落地任务清单。
> 最后更新:2026-06-22。

---

## 1. 目标架构(应有的样子)

```
Weo 终端 (本仓库, fork 自 Claude Code)
   │  Anthropic SDK,baseURL = https://api.weo.asia  (SDK 自动拼 /v1/messages)
   ▼
New API 中继 (VPS, Anthropic 兼容)  ──►  上游各家模型
   ▲
   │  设备流登录 / 额度查询
Weo auth bridge (VPS 上的小服务, server/weo-auth-bridge)
   │  用账号密码登录 New API,签发用户 token + 归一化额度
```

关键约束:
- 终端**只认 Weo**:任何 `CLAUDE_CODE_USE_*` / `OPENAI_*` / 其它厂商 env 都必须失效。
- 凭据 = Weo 平台 token(New API 签发),在 SDK 里当作 `x-api-key`。
- 没有 Anthropic / claude.ai / 任何第三方登录。

---

## 2. 已完成 ✅

| 模块 | 文件 | 说明 |
| --- | --- | --- |
| 单 provider 锁定 | `src/services/weo/lock.ts` | `forceWeoProvider()` 删除所有竞争 env,强制 `ANTHROPIC_BASE_URL=https://api.weo.asia`,把 Weo token 写成 `ANTHROPIC_API_KEY`,设默认模型。启动时调用两次(`cli.tsx:160/251`)。 |
| 平台常量 | `src/constants/weo.ts` | base/bridge/web/device/account/models URL 集中管理,全部可用 env 覆盖。默认 host `https://api.weo.asia`。 |
| 凭据存储 + 登录逻辑 | `src/services/weo/auth.ts` | 设备流(`requestWeoDeviceCode`/`pollWeoDeviceToken`)+ 粘贴 token(`loginWithPastedToken`);token 存 OS 安全存储。 |
| `/login` 登录 UI | `src/commands/login/WeoLoginFlow.tsx` | 浏览器设备流 + 粘贴 token 兜底,纯 Weo,无 Anthropic。 |
| `/provider` 面板(本次新增) | `src/commands/provider/provider.tsx` | 显示登录/额度状态、手动设置/更改 API key、打开官网 `https://api.weo.asia/`、清除凭据。 |
| 额度同步 | `src/services/weo/account.ts` | `fetchWeoAccount()` 调 bridge `/weo/account`,带缓存;`formatQuotaUsd` 换算 USD。 |
| `/balance` | `src/commands/balance/` | 展示共享额度。 |
| `/model` 实时发现 | `src/services/weo/models.ts` + `src/commands/model/model.tsx` | 每次从 `https://api.weo.asia/v1/models` 拉实时模型列表,无静态表。 |
| 禁用非 Weo 命令(本次新增) | `src/commands.ts` | `WEO_DISABLED_COMMAND_NAMES` 过滤掉 `/desktop /mobile /chrome /ide /install-github-app /install-slack-app /onboard-github`。 |
| Auth bridge 服务端代码 | `server/weo-auth-bridge/` | New API 没有设备流,这里补齐:`server.mjs`、`deploy.sh`、Docker、nginx 样例、`verify-newapi.sh`。 |
| 品牌(部分) | `src/constants/product.ts` | `PRODUCT_DISPLAY_NAME='Weo'`;版本号输出 `x.y.z (Weo)`;启动画面已修(PR #1/#3)。 |

---

## 3. 还差什么 / 需要完成 ❌

按优先级排列。每条给出**问题 → 涉及文件 → 建议做法**。

### P0 — 阻断"开箱即用"的核心项

**3.1 首次启动 Weo 登录引导 —— ✅ 已实现**
- `src/interactiveHelpers.tsx` `showSetupScreens` 开头新增 Weo 登录闸口:`if (!hasWeoCredential())` → 弹 `WeoLoginFlow`(浏览器设备流 + 粘贴 token 兜底),成功后 `forceWeoProvider()` 再继续;**拒绝登录则退出**(强制登录,无匿名模式)。
- 非交互(`-p`)模式不经此闸口,headless 用 `WEO_API_KEY` 环境变量。

**3.2 旁路 Anthropic 账号引导流 —— ✅ 已实现**
- 同文件把 `usesAnthropicSetup` 硬置为 `false`(Weo 构建等同第三方 provider),Anthropic onboarding / trust-via-account / approve-Anthropic-key 弹窗不再触发。移除了 `usesAnthropicAccountFlow` 引用。

**3.3 Auth bridge 部署状态未验证**
- 现状:bridge 代码齐全,但是否已部署到 VPS、`https://api.weo.asia` 的反代是否把 `/oauth/*`、`/weo/account` 正确路由,均未验证。New API 原生无设备流,**bridge 不通 = `/login` 设备流不可用**(只能退回粘贴 token)。
- 需要:在 VPS 跑 `deploy.sh`,确认 `WEO_BRIDGE_URL` 指向正确(README 给的是 `https://api.weo.asia/bridge` 或 host 根);用 `verify-newapi.sh` 验证 New API 计费端点。

### P1 — 体验/正确性

**3.4 残留 Anthropic 登录组件 —— ✅ 已禁用(非删除)**
- `src/components/ConsoleOAuthFlow.tsx` 入口加守卫 `weoNativeAnthropicLoginDisabled()`(恒真):任何入口(`Onboarding`、`cli/handlers/util.tsx`、`TeleportError`)挂载它都立即重定向到 `WeoLoginFlow`,用户无法触达 Anthropic 登录。旧 Anthropic OAuth 实现**保留不删**(避免牵连依赖),对应两条旧测试改为 `test.skip`。

**3.5 `/logout` 等账号命令需对齐 Weo**
- 确认 `/logout` 清的是 `clearWeoAuth()` 而非 Anthropic 凭据;`login/index.ts` 的描述/启用条件已是 Weo,但整条 onboarding/auth handler 需通查。

**3.6 文档与对外品牌仍是 OpenClaude 多 provider**
- `README.md`、`CLAUDE.md`、`docs/` 多处仍讲"OpenClaude + 200+ 模型 + 多 provider",与"只支持 Weo"矛盾。需整体改写为 Weo 单平台叙事(安装、登录、额度、`/provider`、`/model`)。

**3.7 源码命名统一 —— ✅ 大部分完成**
- 已完成:可见产品名 `OpenClaude` → `Weo`(`src/` + `scripts/` + 测试全量,带字母边界,不动 camelCase 标识符);配置/数据目录此前已迁移到 `~/.weo/` + `WEO_CONFIG_DIR`(保留 `.openclaude`/`.claude`、`OPENCLAUDE_CONFIG_DIR`/`CLAUDE_CONFIG_DIR` 作回退)。
- **刻意保留**:`bin` 仍提供 `openclaude` 别名(→ `./bin/weo`)以兼容已记录的用法;用户消息里的小写命令字面量 `openclaude update` 等未改(别名仍可用);`src/proto/openclaude.proto` 文件名未改(内部、改动 churny)。这些可按需后续统一。

### P2 — 收尾

**3.8 全量质量门禁未跑**
- 本次改了 `/provider` + 命令禁用,已过:`tsc`(0 错)、新增单测、`bun run smoke`(构建 OK,输出 `0.19.0 (Weo)`)。
- 还需:`bun test`(全量)、`bun run deadcode`(knip;注意旧 `ProviderManager` 现仅被 `ConsoleOAuthFlow` 引用,若 3.4 旁路后会变孤儿)、`bun run verify:privacy`(确认不回连 Anthropic 遥测)。

---

## 4. 关于 Base URL 的确认(重要,无需改动)

你给的是 `https://api.weo.asia/v1`。代码里 `WEO_BASE_URL` 存的是 **host 根** `https://api.weo.asia`,因为 **Anthropic SDK 会自己拼 `/v1/messages`**:
- 对话请求最终 = `https://api.weo.asia/v1/messages` ✅
- 模型列表 = `https://api.weo.asia/v1/models` ✅(`getWeoModelsUrl`)

所以当前实现与你的 `/v1` 是**一致**的,**不要**把 `WEO_BASE_URL` 设成带 `/v1` 的值(会变成 `/v1/v1/messages`)。

---

## 5. 建议的实施顺序

1. **P0-3.3** 先把 bridge 部署确认通(否则登录无从测)。
2. **P0-3.1 + P0-3.2** 实测首启,加 Weo 登录 gate,旁路 Anthropic 引导 → 达成"装好直接登录即用"。
3. **P1-3.4 / 3.5** 清理残留 Anthropic 登录链,统一到 Weo。
4. **P1-3.6** 改写 README / CLAUDE.md 品牌叙事。
5. **P2-3.8** 跑全量门禁,（可选）P1-3.7 命名统一。

---

## 6. 待你确认的开放问题

1. **登录强制程度**:首启无凭据时是"强制必须登录才能用",还是"允许跳过、之后用 `/provider` 粘贴 token"?
2. **设备流 vs 粘贴 token**:主推哪个?(设备流依赖 bridge 部署;粘贴 token 零依赖)
3. **命名统一**:是否现在就把 `openclaude` → `weo`(bin/proto/配置目录),还是留到后面?
4. **`/ide`**:本次已禁用,但仓库带 VS Code 扩展。是否保留 `/ide`?
