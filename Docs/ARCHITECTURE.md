# Willform Architecture

> Status: Platform architecture contract v0.3. 本文定义边界，不冻结具体实现语言。

## 1. Platform Layers

```text
┌───────────────────────────────────────────────────────────┐
│                    Apps / Workbench                       │
│ Browser UI: Authoring / Debugger / Timeline / Validation  │
└────────────────────────────┬──────────────────────────────┘
                             │ portable artifacts + live data
┌────────────────────────────┴──────────────────────────────┐
│                    Portable Packages                      │
│       Core              Schema              Protocol      │
│ semantics / logic   persisted contracts   live contracts │
└────────────────────────────┬──────────────────────────────┘
                             │ host adaptation
┌────────────────────────────┴──────────────────────────────┐
│                         Bridges                           │
│          Unreal        Unity        Godot        Web      │
└────────────────────────────┬──────────────────────────────┘
                             │
┌────────────────────────────┴──────────────────────────────┐
│                  Game / Simulation Host                   │
└───────────────────────────────────────────────────────────┘
```

核心原则：**Workbench 与具体引擎解耦，Bridge 与共享产品语义解耦。**

## 2. Two Planes

Willform 明确区分两个平面。

### Authoring & Debug Plane

主要运行在浏览器：

- 编辑 Agent / Decision / Behavior 配置；
- 验证配置与依赖；
- 连接运行实例；
- 展示 Decision、Intent、Scheduler、Resource、Request；
- 保存 Trace / Timeline；
- 提供 AI 辅助或自动化入口。

### Runtime & Execution Plane

运行在游戏/模拟宿主环境：

- 加载 portable config；
- 采集宿主 Context；
- 驱动 Agent runtime；
- 调用实际 Behavior backend；
- 处理资源、调度、生命周期；
- 可选地向 Workbench 输出 telemetry。

**Runtime Plane 不得依赖 Workbench 在线。**

## 3. Portable Packages

### Packages/Core

承载引擎无关的概念模型与可移植逻辑：Agent、Context、Decision、Intent、Behavior reference、Request、Resource、Scheduler 等。

这里的“Core”描述产品边界，不预先锁死 TypeScript、C++、Rust/WASM 或其他实现方式。具体复用策略应由垂直切片验证后决定。

### Packages/Schema

定义持久化配置和交换资产的稳定语义：

- version；
- IDs / references；
- Agent definitions；
- decision/behavior configuration；
- resource definitions；
- engine-neutral metadata；
- engine extension namespace。

通用字段不得直接包含 `UObject`、Unity `GameObject`、Godot `NodePath` 等宿主专属类型。

### Packages/Protocol

定义 Workbench ↔ Bridge 的实时消息契约，覆盖：

- handshake / capability negotiation；
- project / instance identity；
- Agent inventory；
- runtime snapshot；
- telemetry / trace；
- config sync；
- validation result；
- optional development commands。

Protocol 与传输实现解耦。WebSocket 可以是首版默认 transport，但不能成为协议语义本身。

## 4. Bridge Contract

每个 Bridge 负责把 Willform 产品概念映射到宿主环境。

允许职责：

- Host object ↔ Willform Agent ID；
- Context provider；
- Behavior execution adapter；
- host asset/reference resolver；
- portable config loader；
- telemetry producer；
- protocol transport endpoint；
- project settings / connection bootstrap。

不允许职责：

- 重新定义通用 Agent/Decision/Resource 语义；
- 实现与 Workbench 重复的完整编辑器/Debugger；
- 把宿主对象类型泄漏到共享 Schema；
- 让其他 Bridge 依赖当前 Bridge。

## 5. Unreal Bridge

Unreal 是重要生产验证环境，但位于 `Bridges/Unreal`，不是仓库根架构。

初始模块建议：

```text
WillformUnrealBridge   # Runtime bridge / host adaptation / transport
WillformUnrealEditor   # Settings / sync / connection / launch Workbench
```

StateTree 可以作为 Behavior Execution backend，通过 Unreal Bridge adapter 接入。它不是 Willform Core 的定义来源。

## 6. Unity / Godot / Web Bridges

这些目录用于验证命名和边界是否真正跨引擎。

第一阶段不要求功能对等，但新增共享 Schema/Protocol 时必须能够说明它们如何被这些 Bridge 理解，或者明确记录为什么暂时只能由某个 engine extension 表达。

## 7. Conceptual Runtime

```text
Agent
 ├─ Context / Facts
 ├─ Reasoners
 ├─ Decision / Proposal
 ├─ Intent / Plan
 ├─ Commitment / Lease
 ├─ Arbitration
 ├─ Execution Contract
 ├─ Requests / Resources
 └─ Scheduler
```

- Reasoner：回答“哪些 Goal / Opportunity / Action Proposal 现在更值得考虑”；
- Decision / Tactical Planning：把 Proposal 转换成可执行的计划语义；
- Intent / Commitment：在决策与执行之间提供稳定表达，避免每帧抖动；
- Scheduler / Arbitration：回答“现在谁有权执行”；
- Request / Resource / Ownership：处理竞争、排他和释放；
- Execution Contract：提供最终唯一的移动、武器或其他执行权限。

## 8. Tactical Wizard Fixed Hierarchy

Tactical Wizard 是当前第一生产实验场，其运行链保持：

```text
Perception
    ↓
Authoritative Facts / Contact Knowledge
    ↓
Reasoners
    ↓
Tactical Planning / Spatial Solver
    ↓
Commitment / Lease
    ↓
Operational Arbitration
    ↓
Execution Contract
    ↓
Host
```

任何新 Reasoner 都不得创建第二套移动或武器 Authority。

## 9. IAUS Utility Reasoner

IAUS（Infinite-Axis-style Utility System）当前作为 **Reasoner / Tactical Opportunity Selector** 接入，而不是作为新的总控架构。

首个生产用途是 Incoming-fire Pressure。IAUS 比较：

- `trade_fire`；
- `reposition`；
- `flank`；
- `regroup`；
- 特定非人类思维下的 `assault`。

其输入来自 Authoritative Facts、Combat Profile 和 Squad Capability。其输出只是 Proposal；之后仍然必须经过 Tactical Planner、Commitment / Lease、Operational Arbitration 与 Execution Contract。

这条边界是硬约束：

```text
Utility Score ≠ Execution Authority
```

当前 IAUS 实现保留在 Tactical Wizard reference implementation 中，尚未提升为 `Packages/Core` 的永久 contract。Promotion 条件见 [`Architecture/IAUS_UTILITY_REASONER.md`](Architecture/IAUS_UTILITY_REASONER.md)。

## 10. Data Flow

### Offline authoring

```text
Workbench
   ↓ save/export
Portable Schema Artifact
   ↓ load
Bridge
   ↓ resolve host references
Game Runtime
```

### Live debugging

```text
Game Runtime
   ↓ snapshot / telemetry
Bridge
   ↓ Protocol
Workbench
   ↓ inspect / trace / optional dev command
```

## 11. Open Questions

暂不锁死：

- Core 的最终实现语言与跨语言分发方式；
- portable artifact 的具体文件格式（JSON/二进制/混合）；
- WebSocket、IPC 与远程连接的 transport 组合；
- Reasoner portable API 的最终粒度；
- IAUS 响应曲线何时提升为通用 Schema；
- HTN / GOAP / Statechart Reasoner 的正式接入顺序；
- Scheduler 的宿主粒度；
- 网络复制边界；
- Bridge capability negotiation 的细节；
- Unity/Godot 首个可运行里程碑。

这些问题通过 Tactical Wizard 真实迭代和后续端到端垂直切片决定。
