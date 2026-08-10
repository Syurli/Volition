# 能动 Volition

> **Agent Decision & Behavior Framework**  
> **A BAIGE Project**

**能动 Volition** 是百舸（BAIGE）体系下的游戏 Agent 决策与行为框架，用于组织 Agent 的上下文、决策、行为执行、状态、资源竞争与运行时调度。

Volition 2.0 是一次完全重置。它不继承 UDMBF 1.0 的产品命名或代码兼容包袱；UDMBF 1.0 仅作为独立的商店发布验证项目继续维护。

## Vision

Volition 希望把游戏 AI 从大量硬编码的条件分支，逐步组织为清晰、可调试、可组合的 Agent 运行模型：

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

## Scope

Volition 的长期边界包括：

- Agent 生命周期与运行时上下文
- 决策、意图与行为选择
- Behavior 执行与状态组织
- Resource / Request / Ownership 管理
- 调度、优先级与仲裁
- 调试、可视化与开发工具
- 与具体引擎行为系统的桥接

首个正式实现面向 **Unreal Engine**。框架设计避免把产品概念绑定到某一种具体行为树、StateTree 或单一引擎 API。

## Repository Structure

```text
Volition/
├─ Source/
│  ├─ VolitionCore/       # 稳定的数据模型、基础类型与公共契约
│  ├─ VolitionRuntime/    # Agent、决策、行为、资源与调度运行时
│  └─ VolitionEditor/     # Unreal 编辑器、调试与可视化工具
├─ Docs/                  # 产品、架构、路线与品牌说明
├─ Tests/                 # 自动化与验证资产（随实现逐步建立）
├─ AGENTS.md              # AI / Codex 开发约束
├─ CONTRIBUTING.md
└─ Volition.uplugin
```

## Modules

### VolitionCore

尽量稳定、低依赖的公共层。负责核心数据结构、ID、句柄、接口、事件与跨模块契约。

### VolitionRuntime

运行时主体。负责 Agent 生命周期、Context、Decision、Behavior、Resource、Request、Scheduler 等能力。

### VolitionEditor

仅编辑器使用。负责调试面板、可视化、资产编辑、验证工具与开发体验。

## Status

**Pre-alpha / architecture reset.**

当前仓库处于 2.0 初始化阶段。现阶段优先事项不是迁移 UDMBF 1.0，而是重新建立清晰的产品边界、数据模型、模块依赖和最小可验证运行时。

详细计划见：

- [`Docs/PRODUCT.md`](Docs/PRODUCT.md)
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md)
- [`Docs/ROADMAP.md`](Docs/ROADMAP.md)
- [`Docs/BRAND.md`](Docs/BRAND.md)
- [`AGENTS.md`](AGENTS.md)

## Naming

- 中文名：**能动**
- 英文名：**Volition**
- 技术定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**

代码与模块统一使用 `Volition`，禁止继续引入 `UDMBF2`、`UDMBFNext` 等过渡命名。

## License

License 尚未确定。在正式选择开源许可证之前，请不要默认本仓库内容已按 MIT、Apache-2.0 或其他许可证授权。
