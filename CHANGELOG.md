# Changelog

- Recovery R4: capability-aware rescuer/security arbitration, atomic role swap with progress preservation, Deferred Survival ownership release, emergency logistics interoperability, covered-geometry rejection, security ammo reserve discipline, and repeated-deferral livelock guards.


## Recovery authority and transactional IAUS planning R3

- Fixed stale/dead Recovery rescuer ownership during Safety pause/defer and all-downed squad deadlock.
- Scoped Recovery security/treatment replans, retained safe treatment geometry and medical progress, and allowed covered treatment through residual pressure.
- Made IAUS Tactical Planner validation transactional and replaced squad-wide Regroup masquerading as local reposition with a true single-member planner lease.

所有值得记录的 Willform 变化汇总于此。项目仍处于 pre-alpha，早期 API 和目录结构允许破坏性调整。

## Unreleased

### Changed

- 统一项目英文品牌为 **Willform**，同步代码命名、包作用域、Workbench、Pages 与引擎 Bridge。
- 将仓库从根级 Unreal 插件重构为平台型 monorepo。
- 将主要编辑、调试与可视化职责迁移到 `Apps/Workbench` 的 browser-first 架构。
- 建立 `Packages/Core`、`Packages/Schema`、`Packages/Protocol` 共享层。
- 建立 Unreal、Unity、Godot、Web Bridge 边界。
- Tactical Wizard 的来火战术机会选择改为 **IAUS-style Utility Reasoner**：Utility 只产生 Proposal，不改变既有 Tactical Planning、Commitment/Lease、Operational Arbitration 与 Execution Contract 权威边界。
- Tactical Wizard 现有敌人 Profile 的既定风格参数继续作为 IAUS 轴输入；新增候选权重默认保持中性，避免在启用 IAUS 时静默重写既有敌人风格。
- Workbench 的 Tactical Wizard 设计页增加 IAUS 候选评分、响应轴预览与候选权重编辑，用于解释“为什么当前更值得换位/绕后/收缩/继续对枪”。

### Added

- `Apps/Workbench/src/simulation/iausUtility.ts`
- `Docs/Architecture/IAUS_UTILITY_REASONER.md`
- `Tests/workbench/iausUtility.test.ts`
- `Docs/WEB_WORKBENCH.md`
- `Docs/REPOSITORY.md`

## 2.0.0-dev

- 初始化能动 Willform 品牌与 2.0 重置仓库。
