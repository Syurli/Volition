# Volition Product Definition

## Identity

**能动 Volition**  
**Agent Decision & Behavior Framework**  
**A BAIGE Project**

## Product Statement

Volition 面向游戏中的自主 Agent，提供从 Context 到 Decision、从 Intent 到 Behavior Execution，以及资源竞争、调度、配置与可解释调试的一套统一组织方式。

产品本体不是某一个引擎插件。Volition 由 **Portable Core + Browser Workbench + Engine Bridges** 共同组成。

## Core Problem

传统游戏 AI 很容易随规模增长退化为：

- 大量散落的条件判断；
- 行为之间隐式抢占；
- 生命周期与资源所有权不清晰；
- 决策与执行耦合；
- 配置被锁在某个引擎资产格式；
- Debug 时难以回答“为什么做了这个行为”；
- 每换一个引擎就需要重新开发编辑器和调试器。

Volition 希望把这些问题提升到 Agent 与平台层统一处理。

## Core Loop

```text
Environment → Context → Decision → Intent → Behavior → Execution → Environment
```

## Product Pillars

### 1. Agency

Agent 根据 Context 和目标形成行动，而不是只依赖外部脚本逐条推动。

### 2. Separation of Decision and Execution

“选择做什么”和“具体怎么做”可以独立演进、组合和调试。

### 3. Portable Authoring

尽量使用引擎无关、可版本化的配置与资产契约。相同产品语义应能够跨 Bridge 复用，而不是绑定某个引擎对象格式。

### 4. Browser-first Tooling

主要编辑、调试与可视化体验位于独立 Web 浏览器工作台，使工具可以跨引擎复用，并为远程调试、自动化与 AI 辅助编辑保留统一入口。

### 5. Thin Bridges

引擎插件只处理宿主绑定、执行适配、配置加载、通信与少量项目设置。Volition 不为每个引擎重复开发完整编辑器。

### 6. Explicit Ownership

行为、资源、请求和生命周期的所有权应明确，避免隐式状态竞争。

### 7. Debuggability

开发者应能够回答：当前 Agent 在做什么、为什么选择它、什么阻止了其他行为，以及什么时候发生了切换。

## Product Surfaces

### Volition Workbench

浏览器端主工具：配置、图形化编辑、运行时 Inspector、Timeline、资源/请求分析、验证与项目管理。

### Portable Packages

- **Core**：引擎无关的产品语义与可移植运行逻辑；
- **Schema**：可持久化、可跨引擎传递的配置/资产契约；
- **Protocol**：Workbench 与 Bridge 的实时调试/控制消息契约。

### Bridges

- Unreal Engine：首个正式生产验证 Bridge；
- Unity：预留；
- Godot：预留；
- Web：预留，作为浏览器/JS 游戏运行环境适配。

## Runtime Stance

Workbench 不应成为 shipped game 的必需服务。编辑结果应可本地加载，运行时决策与执行不能因为浏览器未连接而停止。Live connection 主要用于开发期调试、控制与同步。

## Initial Users

第一阶段主要服务需要复杂 NPC / Enemy 行为、可解释调试和跨项目配置管理的游戏开发者。首个生产 Bridge 聚焦 Unreal C++ 项目，但共享层按跨引擎产品设计。

## Non-Goals — Pre-Alpha

当前阶段不承诺：

- UDMBF 1.0 API 或资产兼容；
- 开箱即用的通用 NPC 大脑；
- LLM 驱动 Agent；
- 完整网络复制解决方案；
- Unity / Godot 与 Unreal 在首版即功能完全对等；
- 在每个引擎内提供完整可视化编辑器；
- 稳定公共 API。

## Relationship to UDMBF 1.0

UDMBF 1.0 与 Volition 是两个独立产品阶段。旧项目中经过验证的经验可以被重新评估，但不默认迁移旧实现。
