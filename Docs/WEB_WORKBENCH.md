# Volition Workbench

Volition Workbench 是 **能动 Volition** 的主要编辑、调试与可视化界面，运行于独立 Web 浏览器，而不是嵌入某个游戏引擎编辑器。

## Why Browser-first

- 一套 UI 服务 Unreal / Unity / Godot / Web；
- 与引擎升级周期解耦；
- 容易实现远程连接、实时 Trace 和多实例选择；
- 配置文件可以脱离引擎项目被检查、比较和版本控制；
- 为后续自动化与 LLM 辅助编辑提供统一入口；
- 避免在多个引擎中重复维护 Slate、UI Toolkit、Godot Control 等完整工具栈。

## Initial Surfaces

```text
Project
├─ Config / Definitions
├─ Validation
└─ Bridge Connections

Runtime
├─ Agents
├─ Decision / Intent
├─ Behavior
├─ Requests / Resources
├─ Scheduler
└─ Timeline / Trace
```

## Connection Model

Workbench 通过版本化 Volition Protocol 与 Bridge 通信。Transport 可以根据环境不同使用 WebSocket、IPC 或其他实现。

Workbench 不直接读取 Unreal UObject、Unity GameObject 或 Godot Node；这些宿主对象必须由 Bridge 转换为稳定的 Volition identity、metadata 和 extension data。

## Offline Mode

即使没有运行中的游戏实例，Workbench 也应能够：

- 打开/创建 portable config；
- 编辑和校验 schema；
- 查看引用关系；
- 比较配置差异；
- 导入/导出可移植资产。

## Live Mode

连接 Bridge 后增加：

- runtime agent inventory；
- snapshots；
- decision / scheduler reasons；
- resource ownership；
- trace / timeline；
- development-only commands。

## Engine-side UI Boundary

Bridge 可以提供：项目设置、端口/连接配置、资产绑定、打开 Workbench 按钮等必要 UI。但任何跨引擎都需要的复杂工具都应优先放回 Workbench。
