# Willform Workbench

Willform Workbench 是 **能动 Willform** 的正式浏览器产品界面，也是 Willform GitHub Pages 发布站点本体。

```text
GitHub Pages
    ↓
Apps/Workbench production build
    ↓
Willform Workbench
```

不存在一套独立宣传官网再加另一套 localhost 编辑器。品牌、版本、文档入口、Demo 与 Runtime Inspector 都属于同一个 Workbench Shell。

## Reference Slice 01 Focus

第一版优先做 **Runtime Inspector / Decision Trace**，而不是大型节点图编辑器。

最低界面：

```text
Project / Demo
├─ portable config viewer
├─ schema validation
└─ connection status

Runtime
├─ Agent List
├─ Context
├─ Observation
├─ Memory / Belief
├─ Decision Candidates
├─ Selected Intent
├─ Current Action / Action Result
└─ Timeline / Trace
```

Workbench 必须能回答：**这个 Agent 为什么这样做？**

## Offline / Pages Mode

GitHub Pages 是静态托管。无 Bridge、无 Tactical Wizard 运行实例时仍必须可用：

- 打开 bundled Tactical Wizard generic rifle fixture；
- 回放固定 stimulus stream；
- 查看 Patrol → Investigate → Engage → Search → Patrol；
- 查看 config、runtime snapshot 与 Decision Trace；
- 导入/查看 portable config；
- schema validation。

Pages 不拥有游戏 AI runtime、authoritative state、用户项目数据库，也不引入隐藏云端代理。

## Live Mode

Workbench 通过版本化 Willform Protocol 与 Bridge 通信。Protocol 与 transport 解耦。

### Pages production

Pages 由 HTTPS 提供。生产连接只应尝试浏览器安全上下文允许的 endpoint（首版为 `wss://`）。对 `ws://`、mixed content、无效协议或连接失败必须给出准确诊断，Offline Demo 不受影响。

### Local development

本地开发环境可以连接 `ws://localhost` / 局域网调试 endpoint。该能力不能被描述为 Pages production 已支持。

后续若需要 secure localhost companion、证书或 native bridge，应单独建立 ADR/任务。

## Static Hosting Rules

- Vite base path 通过构建环境配置，Pages 使用 `/Willform/`；
- 应用保持单页/无 history-router 服务端依赖，直接刷新不要求 SPA fallback；
- 不硬编码 localhost API；
- 不要求 SSR；
- static asset 从 Vite base URL 解析；
- Pages workflow 与本地 production 使用同一 `npm run build` artifact。

## Runtime Independence

Workbench 是开发工具，不是 shipping runtime 网络依赖：

- 浏览器关闭后 Host runtime 继续执行；
- telemetry 可以关闭；
- live connection 断开不改变 decision result；
- portable config 由 Host/Bridge 本地加载。
