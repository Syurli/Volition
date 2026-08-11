# Volition Unreal Bridge

Unreal Engine 是 Volition 首个正式生产验证宿主，但本目录只是平台的 Unreal Bridge。

## Scope

- Agent ↔ Actor/Component identity mapping
- Context provider adapters
- Behavior execution adapters（StateTree 可作为首个后端）
- portable config loading / host reference resolving
- telemetry / protocol transport
- Project Settings、连接状态、打开 Workbench 等轻量 Editor integration

完整 Agent 编辑器与 Debugger 不在 Unreal 插件中实现。

插件入口：`VolitionUnreal.uplugin`。
