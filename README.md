# 能动 Willform

> **Agent Decision & Behavior Framework**  
> **A BAIGE Project**
>
> https://syurli.github.io/Willform/

**能动 Willform** 是百舸（BAIGE）体系下的跨引擎游戏 Agent 决策与行为框架。它以可移植的数据模型、配置格式与通信协议为中心，以独立浏览器 **Willform Workbench** 承担主要编辑、调试与可视化工作，再通过轻量 Bridge 接入不同游戏运行环境。

核心理念：**Agency over scripting.**

## Current Reference Application

Willform 当前优先以《战术巫师》作为真实生产实验场，而不是先建设一个脱离游戏需求的万能 AI 平台。已经在《战术巫师》里验证稳定的概念，再逐步抽象进入通用 Willform contracts。

```text
Tactical Wizard / Web
        ↓
Perception / Knowledge / Reasoners / Tactical Planning
        ↓
Commitment / Operational Arbitration / Execution Contract
        ↓
Workbench authoring + simulation + trace
        ↓
Unreal production validation
        ↓
Unity / Godot
```

## Current AI Architecture

Tactical Wizard 使用固定分层的混合式 Agent 架构，而不是单一 Utility AI：

```text
Perception
    ↓
Authoritative Facts / Contact Knowledge
    ↓
Reasoners
    ↓
Tactical Planning / Spatial Solvers
    ↓
Commitment / Lease
    ↓
Operational Arbitration
    ↓
Execution Contract
    ↓
Host
```

### IAUS Utility Reasoner

IAUS（Infinite-Axis-style Utility System）已经作为首个正式战术 Opportunity Reasoner 接入《战术巫师》的来火压力决策。

它负责比较诸如：

- 继续对枪；
- 换位；
- 反机动 / 绕后；
- 收缩 / 脱离；
- 特定非人类思维下的强行突击。

IAUS **只产生 Proposal**。它不会绕过现有 Tactical Commitment、Lease、Operational Arbitration 或 Execution Contract，因此不会把已恢复的战术连续性重新退化成“每帧选最高分动作”。

Workbench 的 Tactical Wizard Design 页面可以直接调整 Combat Profile 与 IAUS 候选倍率，并实时预览候选分数、Hard Gate 与轴响应。

详见 [`Docs/Architecture/IAUS_UTILITY_REASONER.md`](Docs/Architecture/IAUS_UTILITY_REASONER.md)。

## Workbench = GitHub Pages Product

Willform 不维护“宣传官网 + 另一套 localhost 编辑器”。GitHub Pages 直接发布 `Apps/Workbench` 的 production build，打开 Pages 即进入正式 Workbench。

无运行中的游戏实例时，Workbench 仍可运行 Tactical Wizard sandbox、编辑敌人 Profile、查看运行时状态、Decision Trace 与战术可视化。

## Product Shape

```text
                     Browser
              ┌────────────────────┐
              │ Willform Workbench │
              │ Edit / Inspect/Viz │
              └─────────┬──────────┘
                        │
              Schema / Live Protocol
                        │
      ┌─────────────────┴─────────────────┐
      │        Portable Willform Layer     │
      │ Core / Schema / Protocol           │
      └─────────────────┬─────────────────┘
                        │
              Host-specific Bridges
          ┌────────┬────────┬────────┬───────┐
          │  Web   │ Unreal │ Unity  │ Godot │
          └────────┴────────┴────────┴───────┘
```

## Repository Structure

```text
Willform/
├─ Apps/Workbench/
├─ Packages/Core/
├─ Packages/Schema/
├─ Packages/Protocol/
├─ Bridges/Web/
├─ Bridges/Unreal/
├─ Bridges/Unity/
├─ Bridges/Godot/
├─ Examples/
├─ Docs/
└─ Tests/
```

## Reasoner Direction

Willform 不被定义为 Utility AI 框架。Utility / IAUS 是可组合 Reasoner 的第一种成熟实现，未来可以与 Statechart、HTN、GOAP、Rules 等并存；不同 Reasoner 的输出必须经过统一 Proposal、Commitment、Arbitration 与 Execution 语义。

当前原则：**算法是工具箱，Authority / Commitment / Trace 才是共同运行边界。**

## Development

Reference implementation 使用 npm workspaces + TypeScript；Workbench 使用 React + Vite，测试使用 Vitest。该技术栈不是未来 Unreal/C++、Unity 或 Godot 必须嵌入 TypeScript runtime 的产品约束。

```bash
npm install
npm run test
npm run build
```

参考包：

```bash
npm run pack:reference
```

详见：

- [`Docs/PRODUCT.md`](Docs/PRODUCT.md)
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md)
- [`Docs/Architecture/IAUS_UTILITY_REASONER.md`](Docs/Architecture/IAUS_UTILITY_REASONER.md)
- [`Docs/WEB_WORKBENCH.md`](Docs/WEB_WORKBENCH.md)
- [`Docs/ROADMAP.md`](Docs/ROADMAP.md)
- [`Docs/DECISIONS.md`](Docs/DECISIONS.md)
- [`AGENTS.md`](AGENTS.md)

## Naming

- 中文名：**能动**
- 英文名：**Willform**
- 技术定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**

禁止继续引入 `UDMBF2`、`UDMBFNext` 等过渡命名。

## License

License 尚未确定。在正式选择开源许可证之前，请不要默认本仓库内容已按 MIT、Apache-2.0 或其他许可证授权。
