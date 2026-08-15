# Repository Layout

Willform 使用平台型 monorepo，而不是以任一游戏引擎插件作为仓库根结构。

```text
Apps/Workbench
Packages/Core
Packages/Schema
Packages/Protocol
Bridges/Unreal
Bridges/Unity
Bridges/Godot
Bridges/Web
Examples
Docs
Tests
```

## Apps

最终用户直接使用的独立应用。当前只有 `Workbench`，负责浏览器编辑、调试和可视化。

## Packages

跨宿主共享的产品层。

- `Core`：核心 Agent 语义与可移植逻辑；
- `Schema`：持久化数据契约；
- `Protocol`：实时通信契约。

Package 不能依赖任何 `Bridges/*`。

## Bridges

宿主适配层。每个 Bridge 自包含自己的 SDK、构建文件和必要编辑器集成，不得向仓库根泄漏引擎结构。

## Examples

端到端 reference scenarios。长期应同时存在 engine-specific 示例与能够验证共享 Schema/Protocol 的跨平台 fixtures。

## Tests

按层组织验证，而不是只依赖某个引擎工程：

- schema fixtures；
- protocol serialization；
- core deterministic tests；
- bridge contract tests；
- end-to-end connection tests。
