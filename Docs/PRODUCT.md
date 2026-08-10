# Volition Product Definition

## Identity

**能动 Volition**  
**Agent Decision & Behavior Framework**  
**A BAIGE Project**

## Product Statement

Volition 面向游戏中的自主 Agent，提供从上下文到决策、从意图到行为执行，以及资源竞争与运行时调度的一套统一组织方式。

它的目标不是替开发者自动生成“聪明 AI”，而是提供一个清晰、可组合、可调试的基础框架，让复杂 AI 行为能够被工程化管理。

## Core Problem

传统游戏 AI 很容易随规模增长退化为：

- 大量散落的条件判断；
- 行为之间隐式抢占；
- 生命周期与资源所有权不清晰；
- 决策与执行耦合；
- Debug 时难以回答“为什么做了这个行为”；
- 行为树、StateTree 或自定义逻辑之间缺少统一调度层。

Volition 希望把这些问题提升到 Agent 层统一处理。

## Core Loop

```text
Environment
    ↓
Context
    ↓
Decision
    ↓
Intent
    ↓
Behavior
    ↓
Execution
    ↓
Environment
```

## Product Pillars

### 1. Agency

Agent 根据自身 Context 和目标形成行动，而不是只依赖外部脚本逐条推动。

### 2. Separation of Decision and Execution

“选择做什么”和“具体怎么做”应可以独立演进、组合和调试。

### 3. Explicit Ownership

行为、资源、请求和生命周期的所有权应明确，避免隐式状态竞争。

### 4. Debuggability

开发者应能够回答：

- 当前 Agent 在做什么？
- 为什么选择它？
- 哪个请求/资源阻止了其他行为？
- 哪个状态导致了切换？

### 5. Engine-Aware, Not Engine-Locked

首个正式实现面向 Unreal Engine，但产品概念不应被单一引擎行为系统定义。

## Initial Users

第一阶段主要服务：

- 需要复杂 NPC / Enemy 行为的 Unreal C++ 开发者；
- 希望在 StateTree、行为树或自定义行为之间建立更高层组织方式的团队；
- 需要可视化调试 Agent 决策与运行状态的开发者。

## Non-Goals — Pre-Alpha

当前阶段不承诺：

- UDMBF 1.0 API 或资产兼容；
- 开箱即用的通用 NPC 大脑；
- LLM 驱动 Agent；
- 网络复制的完整解决方案；
- 跨引擎可运行版本；
- 稳定公共 API。

这些能力可以进入后续路线，但不应干扰核心 Runtime 的最小闭环。

## Relationship to UDMBF 1.0

UDMBF 1.0 与 Volition 是两个独立产品阶段：

- **UDMBF 1.0**：继续完成原有商店发布与流程验证；
- **Volition**：2.0 方向的完全重置，不承担历史命名和兼容包袱。

旧项目中经过验证的经验可以被重新评估，但不默认迁移旧实现。
