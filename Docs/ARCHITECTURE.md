# Volition Architecture

> Status: Initial architecture contract v0.1. This document defines boundaries, not a frozen implementation.

## 1. Layering

```text
┌─────────────────────────────────────────────┐
│              VolitionEditor                 │
│ Debugger / Visualization / Asset Tooling    │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│              VolitionRuntime                │
│ Agent / Decision / Behavior / Resource      │
│ Request / Scheduler / Engine Integration    │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│                VolitionCore                 │
│ IDs / Handles / Contracts / Events / Types  │
└─────────────────────────────────────────────┘
```

依赖必须保持单向：`Editor → Runtime → Core`。

## 2. Conceptual Runtime

初始概念模型：

```text
Agent
 ├─ Context
 ├─ Decision
 ├─ Intent
 ├─ Behavior
 ├─ Requests
 ├─ Resources
 └─ Scheduler
```

这些名称描述产品概念，不代表当前已经存在同名 UObject 或 C++ 类型。

## 3. Agent

Agent 是 Volition 的运行时主体。

职责方向：

- 维护自身生命周期；
- 提供可查询 Context；
- 承载当前 Intent / Behavior 状态；
- 参与调度、请求和资源仲裁；
- 暴露可调试状态。

Agent 不应成为包含所有 AI 逻辑的 God Object。

## 4. Context

Context 表示做出决策所需的当前信息。

设计原则：

- 明确来源与生命周期；
- 避免让决策逻辑直接抓取任意世界状态；
- 支持调试时解释“当时看到了什么”；
- 后续可以区分稳定上下文、瞬时事件和派生值。

## 5. Decision & Intent

Decision 负责回答“当前更应该做什么”。

Intent 是 Decision 与具体 Behavior 执行之间的稳定表达层。

这样做的目的，是允许未来存在不同决策来源，例如 Utility、规则系统、任务系统或上层 Director，而不用让执行层被某一种决策算法锁死。

## 6. Behavior

Behavior 表示可执行的行动单元或行动流程。

Volition 不规定 Behavior 必须由某一种系统实现。Unreal 首版可以与 StateTree 等系统集成，但集成应处于 Runtime/Adapter 边界，而不是反向定义 Core。

## 7. Request / Resource / Ownership

这一组概念负责解决行为竞争：

- **Request**：某个行为希望获得或改变什么；
- **Resource**：存在竞争或排他性的运行时能力；
- **Ownership**：当前谁持有资源或执行权；
- **Release**：生命周期结束时如何显式归还。

设计时应避免“请求已结束但资源仍被隐式占用”的状态。

## 8. Scheduler / Arbitration

Scheduler 负责决定哪些工作可以进入执行阶段，以及竞争发生时如何处理。

它不应吞并 Decision 的全部职责：

- Decision 主要表达 **应该做什么**；
- Scheduler / Arbitration 主要表达 **现在什么可以执行**。

这个边界后续需要通过最小垂直切片验证。

## 9. StateTree Integration

StateTree 在 Unreal 实现中可以承担 Behavior Execution 的重要角色。

原则：

- StateTree 是 integration target，不是 Volition 的产品定义；
- `VolitionCore` 不依赖 StateTree；
- 与 StateTree 相关的 evaluator/task/schema/adapter 应位于 Runtime 或后续独立 integration module；
- 应允许未来接入其他行为执行后端。

## 10. Editor & Debugger

调试能力应从 Runtime 数据模型开始设计，而不是最后补做。

目标调试信息至少应逐步覆盖：

- Agent 当前状态；
- 当前 Decision / Intent；
- Behavior 切换原因；
- 活跃 Request；
- Resource ownership；
- Scheduler 选择/拒绝原因；
- 关键状态时间线。

## 11. Open Questions

以下内容暂不在初始化阶段强行锁死：

- Decision Policy 的具体接口形态；
- Intent 是否需要独立 UObject / UStruct 表达；
- Resource 粒度与层级；
- Scheduler 是每 Agent、World 级还是混合结构；
- StateTree integration 是否拆成独立模块；
- 网络复制边界；
- Mass / ECS integration。

这些问题应通过后续垂直切片和 ADR 决定，而不是在没有代码验证前一次性设计完。
