# Contributing to Volition

感谢参与 **能动 Volition** 的开发。当前项目处于 pre-alpha，架构清晰度优先于兼容性和功能数量。

## Before You Start

请先阅读 `README.md`、`AGENTS.md`、`Docs/PRODUCT.md`、`Docs/ARCHITECTURE.md`、`Docs/DECISIONS.md`。

## Branches

建议使用短生命周期分支：`feat/<topic>`、`fix/<topic>`、`refactor/<topic>`、`docs/<topic>`、`chore/<topic>`。

## Pull Requests

一个 PR 尽量只解决一个主题，并说明目的、主要改动、架构影响、验证方式和未完成项。

## Coding Principles

- 仓库根不是 Unreal / Unity / Godot 插件；
- 浏览器 Workbench 是主要编辑和调试 surface；
- `Packages/*` 保持 engine-agnostic；
- `Bridges/*` 只解决宿主适配；
- 不在多个 Bridge 中复制完整编辑器；
- Schema / Protocol 必须版本化；
- Debuggability 是功能的一部分；
- 资源所有权与生命周期必须明确；
- 不为未经验证的未来需求提前构建复杂抽象。

## Cross-engine Changes

新增共享字段或协议消息时，应说明：

1. 它是否为真正的 Volition 通用概念；
2. Unreal / Unity / Godot / Web 如何理解该字段；
3. 若仅某宿主需要，为什么不能放入 engine extension；
4. 兼容性和版本影响。

## Compatibility

Volition 不以 UDMBF 1.0 兼容为目标。任何迁移层必须由明确任务驱动。

## License

项目许可证尚未确定。提交第三方代码或资产前必须确认授权。
