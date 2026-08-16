# Willform Workbench

Willform Workbench 是 **能动 Willform** 的正式浏览器产品界面，也是 GitHub Pages 发布站点本体。

```text
GitHub Pages
    ↓
Apps/Workbench production build
    ↓
Willform Workbench
```

不存在一套独立宣传官网再加另一套 localhost 编辑器。品牌、项目、设计、Simulation、Debug、Run Log 与 Visualization 都属于同一个 Workbench Shell。

## Product role

Workbench 当前承担：

- Tactical Wizard 项目设计；
- Enemy Archetype / Combat Profile 编辑；
- IAUS Utility Reasoner authoring / preview；
- 2D 战术 Simulation Sandbox；
- Contact / Recovery / Pressure / Dynamic World 调试；
- Decision Trace / Run Log；
- 后续 Bridge live telemetry。

Workbench 必须始终能回答两个问题：

1. **这个 Agent / Squad 为什么这样做？**
2. **如果设计师调整一个决策轴，候选行为为什么发生变化？**

## Tactical Wizard-first authoring

当前优先级不是建设万能 Reasoner Graph，而是把《战术巫师》真实使用到的工具做完整，再抽象共性。

Design 页面当前包含：

```text
Tactical Wizard Design
├─ Enemy Archetype / Combat Profile
│  ├─ aggression
│  ├─ suppression tolerance
│  ├─ coordination
│  ├─ normal flank bias
│  ├─ reposition bias
│  ├─ hold-ground bias
│  ├─ counter-maneuver bias
│  └─ break-contact bias
│
├─ IAUS Tactical Opportunity Reasoner
│  ├─ candidate multipliers
│  ├─ hard availability gates
│  ├─ axis response preview
│  ├─ utility score preview
│  └─ selected winner
│
└─ Existing Agent / Squad / Behavior authoring
```

IAUS 的第一版曲线定义仍由 Tactical Wizard reference implementation 提供。设计师可以调整 Profile axes 和候选倍率，并通过 Preview 即时查看分数变化。

暂不把“任意节点、任意曲线、任意 Reasoner 连接”当成本轮目标。只有当真实 Tactical Wizard 调参证明需要时，才将 curve editor / generic Reasoner Graph 提升为平台能力。

## IAUS preview contract

IAUS Preview 不是运行时替代品。其目的为可解释调参：

- 输入一个假设来火压力；
- 选择受压人数；
- 选择当前 Tactical Commitment；
- 使用当前 Combat Profile；
- 展示 `trade_fire / reposition / flank / regroup / assault` 的候选分数；
- 显示 Hard Gate；
- 展示每条 Utility Axis 的 response。

真正运行时仍使用同一 utility evaluator，但赢家只形成 Proposal，随后必须经过 Tactical Planner、Commitment、Arbitration 和 Execution Contract。

## Offline / Pages Mode

无 Bridge、无游戏运行实例时仍必须可用：

- 编辑 Tactical Wizard config；
- 运行 Tactical Wizard sandbox；
- 修改 Profile / IAUS 参数；
- 查看运行时状态、战术、压力、救援和动态掩体；
- 查看 Decision Trace / Run Log；
- 导入、保存项目配置。

Pages 不拥有 authoritative game state、用户项目数据库，也不引入隐藏云端代理。

## Live Mode

Workbench 通过版本化 Willform Protocol 与 Bridge 通信。Protocol 与 transport 解耦。

### Pages production

Pages 由 HTTPS 提供。生产连接只尝试浏览器安全上下文允许的 endpoint（首版 `wss://`）。连接失败不会影响 Offline Simulation。

### Local development

本地环境可连接 `ws://localhost` / 局域网调试 endpoint。后续 secure companion 或 native bridge 单独建立 ADR。

## Static Hosting Rules

- Vite Pages base path 使用 `/Willform/`；
- 不硬编码 localhost API；
- 不要求 SSR；
- static asset 从 Vite base URL 解析；
- Pages workflow 与本地 production 使用同一 `npm run build` artifact。

## Runtime Independence

Workbench 是开发工具，不是 shipping runtime 网络依赖：

- 浏览器关闭后 Host runtime 继续执行；
- telemetry 可以关闭；
- live connection 断开不改变 decision result；
- portable config 由 Host / Bridge 本地加载。
