# 能动 Volition

> **Agent Decision & Behavior Framework**  
> **A BAIGE Project**

**能动 Volition** 是百舸（BAIGE）体系下的跨引擎游戏 Agent 决策与行为框架。它以可移植的数据模型、配置格式与通信协议为中心，以独立的浏览器工作台承担主要编辑、调试和可视化工作，再通过轻量 Bridge 接入 Unreal Engine、Unity、Godot 与 Web 游戏运行环境。

Volition 是 UDMBF 2.0 方向的完全重置，不继承 UDMBF 1.0 的产品命名、目录布局或 API 兼容包袱。UDMBF 1.0 仅继续完成原有商店发布与流程验证。

## Vision

Volition 希望把游戏 AI 从大量引擎内硬编码与分散工具，组织为一个可以跨项目、跨引擎理解和调试的 Agent 系统：

```text
Environment
    ↓
Context / Perception
    ↓
Decision / Intent
    ↓
Behavior Selection
    ↓
Execution
    ↓
Environment
```

核心理念：**Agency over scripting.**

## Product Shape

Volition 不以某个引擎插件作为产品本体。

```text
                     Browser
              ┌──────────────────┐
              │ Volition Workbench│
              │ Edit / Debug / Viz│
              └────────┬─────────┘
                       │
             Schema / Live Protocol
                       │
      ┌────────────────┴────────────────┐
      │      Portable Volition Layer     │
      │ Core / Schema / Protocol         │
      └────────────────┬────────────────┘
                       │
         Engine / Host specific Bridges
          ┌────────┬────────┬────────┐
          │ Unreal │ Unity  │ Godot  │ Web
          └────────┴────────┴────────┘
```

### Browser-first tooling

主要开发体验位于 **Volition Workbench**：

- Agent / behavior 配置编辑；
- Decision / Intent 可视化；
- Request / Resource / Ownership 检查；
- Scheduler trace 与行为时间线；
- 校验、诊断与跨引擎配置管理；
- 与正在运行的游戏实例连接并接收实时调试数据。

### Thin engine bridges

引擎内只保留必须贴近宿主运行时的能力：

- Agent 与宿主对象的注册和映射；
- Context 数据采集与转换；
- Behavior 执行后端适配；
- Portable config 的加载与应用；
- Live telemetry / command transport；
- 少量项目设置、连接、导入导出与 Workbench 启动入口。

**完整编辑器、调试器和主要可视化界面不在引擎插件中重复实现。**

浏览器工作台也不是 shipping runtime 的强依赖：游戏在没有 Workbench 连接时必须可以正常运行。

## Repository Structure

```text
Volition/
├─ Apps/
│  └─ Workbench/          # 独立 Web 编辑器、调试器与可视化工作台
├─ Packages/
│  ├─ Core/               # 引擎无关的核心语义与可移植逻辑
│  ├─ Schema/             # 跨引擎配置/资产数据契约
│  └─ Protocol/           # Workbench ↔ Bridge 实时通信协议
├─ Bridges/
│  ├─ Unreal/             # Unreal 插件：桥接 + 配置
│  ├─ Unity/              # Unity Package 预留
│  ├─ Godot/              # Godot Addon 预留
│  └─ Web/                # Web 游戏运行环境 Bridge 预留
├─ Examples/              # 跨平台样例与验证场景
├─ Docs/                  # 产品、架构、协议与开发决策
├─ Tests/                 # Schema / Protocol / Core / Bridge 验证
├─ AGENTS.md              # AI / Codex 开发约束
└─ CONTRIBUTING.md
```

## Current Priority

当前阶段为 **Pre-alpha / platform foundation**。

优先级是：

1. 固定跨引擎产品边界；
2. 定义可版本化的 Schema 与 Protocol；
3. 建立浏览器 Workbench 最小壳层；
4. 用 Unreal Bridge 完成第一个端到端垂直切片；
5. 再逐步实现完整 Agent runtime、调试和其他引擎 Bridge。

详见：

- [`Docs/PRODUCT.md`](Docs/PRODUCT.md)
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md)
- [`Docs/WEB_WORKBENCH.md`](Docs/WEB_WORKBENCH.md)
- [`Docs/REPOSITORY.md`](Docs/REPOSITORY.md)
- [`Docs/ROADMAP.md`](Docs/ROADMAP.md)
- [`Docs/DECISIONS.md`](Docs/DECISIONS.md)
- [`Docs/BRAND.md`](Docs/BRAND.md)
- [`AGENTS.md`](AGENTS.md)

## Naming

- 中文名：**能动**
- 英文名：**Volition**
- 技术定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**

禁止继续引入 `UDMBF2`、`UDMBFNext` 等过渡命名。

## License

License 尚未确定。在正式选择开源许可证之前，请不要默认本仓库内容已按 MIT、Apache-2.0 或其他许可证授权。
