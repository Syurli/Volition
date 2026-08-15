# Willform Architecture

> Status: Platform architecture contract v0.2. 本文定义边界，不冻结具体实现语言。

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

Unreal 是首个生产验证环境，但位于 `Bridges/Unreal`，不是仓库根架构。

初始模块建议：

```text
WillformUnrealBridge   # Runtime bridge / host adaptation / transport
WillformUnrealEditor   # Settings / sync / connection / launch Workbench
```

StateTree 可以作为 Behavior Execution backend，通过 Unreal Bridge adapter 接入。它不是 Willform Core 的定义来源。

## 6. Unity / Godot / Web Bridges

这些目录现在预留，以便从一开始验证命名和边界是否真正跨引擎。

第一阶段不要求功能对等，但新增共享 Schema/Protocol 时必须能够说明它们如何被这些 Bridge 理解，或者明确记录为什么暂时只能由某个 engine extension 表达。

## 7. Conceptual Runtime

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

- Decision：回答“当前更应该做什么”；
- Intent：在决策与执行之间提供稳定表达；
- Scheduler / Arbitration：回答“现在什么可以执行”；
- Request / Resource / Ownership：处理竞争、排他和释放。

## 8. Data Flow

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

## 9. Open Questions

暂不在初始化阶段锁死：

- Core 的最终实现语言与跨语言分发方式；
- portable artifact 的具体文件格式（JSON/二进制/混合）；
- WebSocket、IPC 与远程连接的 transport 组合；
- Decision Policy 的具体接口；
- Scheduler 的宿主粒度；
- 网络复制边界；
- Bridge capability negotiation 的细节；
- Unity/Godot 首个可运行里程碑。

这些问题通过端到端垂直切片和 ADR 决定。
