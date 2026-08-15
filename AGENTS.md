# AGENTS.md

本文件定义 AI 编码代理（Codex、ChatGPT 或其他自动化开发代理）在 **Willform** 仓库中的默认工作约束。

## 1. Project Identity

- 产品名：**能动 Willform**
- 定位：**Agent Decision & Behavior Framework**
- 厂牌：**A BAIGE Project**
- 当前阶段：**platform reset / pre-alpha**

Willform 是新项目。除非任务明确要求，否则不要迁移、复制、兼容或复刻 UDMBF 1.0 的 API、类名、文件布局和历史实现。

## 2. Repository Is Not An Engine Plugin

仓库根目录代表完整 Willform 平台，而不是 Unreal、Unity、Godot 中任意一个插件。

顶层职责：

```text
Apps/Workbench   -> 浏览器端主要编辑、调试、可视化体验
Packages/Core    -> 引擎无关核心语义/可移植逻辑
Packages/Schema  -> 跨引擎可复用配置与资产契约
Packages/Protocol-> Workbench 与 Bridge 通信契约
Bridges/*        -> 宿主引擎/运行环境适配
```

禁止把某个引擎的 Source、插件描述文件或编辑器模块重新放回仓库根目录。

## 3. Browser-first Tooling

完整的 Agent 编辑器、Debugger、Timeline、Resource/Request Inspector、Decision 可视化等功能应优先实现于 `Apps/Workbench`。

引擎内 UI 仅允许承担轻量集成功能，例如：

- 项目设置；
- 连接状态；
- 导入/导出或同步；
- 打开/启动 Workbench；
- 宿主引擎必须提供的选择器或绑定界面。

不要在多个引擎插件里重复实现一套完整 Willform 编辑器。

## 4. Engine Bridge Policy

`Bridges/Unreal`、`Bridges/Unity`、`Bridges/Godot`、`Bridges/Web` 只处理宿主特有问题：

- Host object / Agent identity mapping；
- Context 采集；
- Behavior execution adapter；
- 配置加载与宿主资源引用；
- Telemetry / command transport；
- 生命周期、线程、序列化等宿主边界。

Bridge 不应重新定义 Core 概念。Engine-specific 数据只允许进入共享 Schema 的明确 extension 区域，不能污染通用字段。

不同 Bridge 不得互相依赖。

## 5. Portable Layer Rules

`Packages/Core`、`Packages/Schema`、`Packages/Protocol` 不得依赖 Unreal、Unity、Godot SDK 或引擎专属类型。

共享数据命名应描述产品概念，例如 Agent、Context、Intent、Behavior、Request、Resource、Scheduler，而不是 `UObject`、`GameObject`、`Node` 等宿主实现。

实现语言和构建系统仍可演进；在 ADR 未确认前，不要因为某个 Bridge 的语言选择反向锁死整个 Core。

## 6. Runtime Independence

Workbench 是主要开发工具，但不是 shipping runtime 的强依赖。

任何核心运行路径都必须满足：

- 浏览器未打开时仍能执行；
- Live connection 断开不会破坏 Agent 生命周期；
- Debug telemetry 可以禁用或降级；
- 编辑数据能够以版本化的 portable artifact 被 Bridge 本地加载。

## 7. Protocol & Schema Discipline

- Schema 与 Protocol 必须有显式版本。
- 破坏兼容的字段变更必须记录在 `Docs/DECISIONS.md` / CHANGELOG。
- 协议实现应与具体传输方式解耦；WebSocket 可以是首选实现，但不是产品语义本身。
- 所有 Bridge 对同一通用字段应具有一致语义。
- 不允许通过未版本化的自由 JSON 长期传递关键运行状态。

## 8. StateTree And Other Engine Systems

StateTree 可以是 Unreal Bridge 的重要 Behavior Execution backend，但 **Willform ≠ StateTree Framework**。

同理，Unity Behavior Tree、Godot Node/Resource 或 Web 端任意库都只能作为 Bridge/Adapter 实现，不得成为跨引擎 Core 的定义来源。

## 9. Naming Rules

统一使用：

- `Willform`：产品和共享概念；
- `Willform Workbench`：浏览器工具；
- `Willform Unreal Bridge` / `Unity Bridge` / `Godot Bridge` / `Web Bridge`：宿主适配。

禁止新增 `UDMBF2`、`UDMBFNext` 等旧品牌过渡命名。

## 10. Change Discipline

- 一次任务解决一个明确问题。
- 避免无关重构。
- 新增通用概念前先检查 `Docs/ARCHITECTURE.md` 与 `Docs/DECISIONS.md`。
- 架构选择存在长期影响时必须记录决策。
- 优先端到端垂直切片，不提前实现大而全抽象。
- Bridge-specific 功能不能为了方便直接进入共享层。

## 11. Build & Validation

按改动范围验证：

1. Workbench：类型检查、lint、测试、浏览器运行验证；
2. Schema：schema validation、兼容性 fixtures；
3. Protocol：序列化/反序列化、版本与消息契约测试；
4. Bridge：对应宿主引擎构建与最小连接测试；
5. 跨层改动：至少完成一个端到端数据往返验证。

无法在当前环境验证时必须明确说明，不得声称已通过。

## 12. License Policy

当前 License 尚未确定。不得自行加入 MIT、Apache-2.0、GPL 等许可证，也不要复制许可证不明确的第三方代码。

## 13. Definition of Done

任务完成时至少说明：改了什么、为什么这样改、如何验证、未验证项，以及下一步最合理的后续任务。
