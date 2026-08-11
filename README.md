# 能动 Volition

> **Agent Decision & Behavior Framework**  
> **A BAIGE Project**

**能动 Volition** 是百舸（BAIGE）体系下的跨引擎游戏 Agent 决策与行为框架。它以可移植的数据模型、配置格式与通信协议为中心，以独立浏览器 **Volition Workbench** 承担主要编辑、调试与可视化工作，再通过轻量 Bridge 接入不同游戏运行环境。

核心理念：**Agency over scripting.**

## Current Reference Application

Volition 的第一个真实 Reference Application 是 `Syurli/TWR_Dev` / 《战术巫师：裂隙突围》，首个 Reference Host 是 Web；Unreal Engine 是第二个重要生产验证 Host，用于证明 portable semantics 不依赖 TypeScript/Web。

```text
Tactical Wizard / Web
        ↓
Core / Schema / Protocol / Workbench / Trace
        ↓
Unreal production validation
        ↓
Unity / Godot
```

## Workbench = GitHub Pages Product

Volition 不维护“宣传官网 + 另一套 localhost 编辑器”。GitHub Pages 直接发布 `Apps/Workbench` 的 production build，打开 Pages 即进入正式 Workbench。

无运行中的游戏实例时，Workbench 仍可打开 bundled Tactical Wizard deterministic demo、查看 portable config、Agent runtime snapshot 与 Decision Trace。

## Product Shape

```text
                     Browser
              ┌────────────────────┐
              │ Volition Workbench │
              │ Edit / Inspect/Viz │
              └─────────┬──────────┘
                        │
              Schema / Live Protocol
                        │
      ┌─────────────────┴─────────────────┐
      │        Portable Volition Layer     │
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
Volition/
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

## Reference Slice 01 Scope

首个 Portable Core 只实现支撑一个普通持枪 Agent 的最小闭环：

`Context → Stimulus → Observation → Memory/Belief → Decision Candidates → Intent → Action → ActionResult → Trace`

Decision API 保持可插拔。首版 Tactical Wizard fixture 使用 **Utility Decision + explicit behavior state**，但 Volition 不被永久定义为 Utility AI 框架。

Scheduler / Request / Resource / Ownership、Squad/Director、GOAP、HTN、Behavior Tree 编辑器、LLM Planner、Mass/ECS 与网络复制均不进入第一纵向切片。

## Development

Reference Slice 01 使用 npm workspaces + TypeScript；Workbench 使用 React + Vite，测试使用 Vitest。该技术栈是首个 **reference implementation**，不是未来 Unreal/C++、Unity 或 Godot 必须嵌入 TypeScript runtime 的产品约束。

当前分支尚未提交 `package-lock.json`，因此使用已经由 CI 验证的安装命令：

```bash
npm install
npm run test
npm run build
```

参考包可用以下命令在本地生成，不要求 TWR 提交机器绝对路径依赖：

```bash
npm run pack:reference
```

详见：

- [`Docs/PRODUCT.md`](Docs/PRODUCT.md)
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md)
- [`Docs/WEB_WORKBENCH.md`](Docs/WEB_WORKBENCH.md)
- [`Docs/ROADMAP.md`](Docs/ROADMAP.md)
- [`Docs/DECISIONS.md`](Docs/DECISIONS.md)
- [`AGENTS.md`](AGENTS.md)

## Naming

- 中文名：**能动**
- 英文名：**Volition**
- 技术定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**

禁止继续引入 `UDMBF2`、`UDMBFNext` 等过渡命名。

## License

License 尚未确定。在正式选择开源许可证之前，请不要默认本仓库内容已按 MIT、Apache-2.0 或其他许可证授权。
