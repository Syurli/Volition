# Changelog

所有值得记录的 Willform 变化汇总于此。项目仍处于 pre-alpha，早期 API 和目录结构允许破坏性调整。

## Unreleased

### Changed

- 统一项目英文品牌为 **Willform**，同步代码命名、包作用域、Workbench、Pages 与引擎 Bridge。
- 将仓库从根级 Unreal 插件重构为平台型 monorepo。
- 将主要编辑、调试与可视化职责迁移到 `Apps/Workbench` 的 browser-first 架构。
- 建立 `Packages/Core`、`Packages/Schema`、`Packages/Protocol` 共享层。
- 建立 Unreal、Unity、Godot、Web Bridge 边界。
- Unreal 插件移动到 `Bridges/Unreal`，仅保留桥接与轻量配置/Editor integration 方向。

### Added

- `Docs/WEB_WORKBENCH.md`
- `Docs/REPOSITORY.md`

## 2.0.0-dev

- 初始化能动 Willform 品牌与 2.0 重置仓库。
