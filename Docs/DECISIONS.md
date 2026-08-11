# Volition Architecture Decisions

该文件记录已经确定、会影响后续开发方向的高层决策。更复杂的设计成熟后可以迁移为独立 ADR 文件。

---

## D-001 — 2.0 Is a Clean Reset

**Status:** Accepted

Volition 不作为 UDMBF 1.0 的原位升级继续开发。不继承旧命名、API、资产兼容与目录布局。

---

## D-002 — Product Name Is Volition / 能动

**Status:** Accepted

- 中文：能动
- 英文：Volition
- Descriptor：Agent Decision & Behavior Framework
- Attribution：A BAIGE Project

---

## D-003 — Platform-first, Reference-application-first Validation

**Status:** Accepted

Volition 的产品边界从第一天按跨引擎平台设计。首个真实 Reference Application / Reference Host 调整为 `Syurli/TWR_Dev` / Tactical Wizard 的 Web Host；Unreal Engine 保持第二个重要生产验证 Host，用于证明 portable contracts 与 runtime 不依赖 TypeScript/Web。

### Validation order

```text
Reference Application #1: Tactical Wizard / Web
Reference Production Validation #2: Unreal
Additional Validation: Unity / Godot
```

### Consequences

- TWR/Web 优先验证 Core、Schema、Protocol、Web Bridge、Workbench 与 Decision Trace；
- 不删除 `Bridges/Unreal`；
- 共享概念不得由 TWR、Babylon.js、Jolt、Vlox、StateTree 或 Unreal API 反向定义；
- Unreal 仍承担首个跨语言/跨引擎生产验证职责；
- Unity / Godot 继续作为后续额外验证 Host。

---

## D-004 — Old UE Module Root Boundary

**Status:** Superseded by D-006

早期初始化曾采用 `VolitionEditor → VolitionRuntime → VolitionCore` 的根目录 Unreal 插件布局。该布局会让仓库形态与产品定位冲突，因此不再作为平台架构。

---

## D-005 — License Is Deliberately Undecided

**Status:** Accepted

许可证会影响 GitHub 开源、商店发布、商业使用和第三方贡献策略，因此初始化阶段不自动选择 MIT / Apache / GPL 或其他许可证。

---

## D-006 — Browser-first Tooling, Thin Engine Bridges

**Status:** Accepted

Volition 的主要编辑、调试和可视化体验位于独立浏览器 Workbench。引擎插件仅保留桥接、配置、宿主绑定、运行时适配和轻量连接入口。

### Consequences

- 不在 Unreal / Unity / Godot 内分别维护完整 Volition 编辑器；
- Workbench 成为统一开发体验与 live debugging surface；
- Bridge 可以有 Project Settings、连接状态、打开 Workbench 等必要轻量 UI；
- Workbench 不作为 shipped game runtime 的强依赖。

---

## D-007 — Schema And Protocol Are Cross-engine Boundaries

**Status:** Accepted

跨引擎可复用性首先建立在稳定的数据契约，而不是强行共享同一套引擎代码。

### Consequences

- `Packages/Schema` 管理持久化配置/资产语义；
- `Packages/Protocol` 管理实时调试/控制消息语义；
- 宿主特有字段进入明确的 extension namespace；
- Schema / Protocol 必须版本化并建立兼容测试。

---

## D-008 — Portable Core Must Not Be Locked By A Bridge Language

**Status:** Accepted

`Packages/Core` 表示引擎无关产品语义和可移植逻辑，但当前不预先锁死实现语言。

### Consequences

- 不因为 Unreal 首发就默认 Core 永久是 Unreal C++ 模块；
- 不因为 Workbench 使用 Web 技术就默认运行时必须依赖 JavaScript；
- 跨语言分发策略通过实际垂直切片决定。

---

## D-009 — Workbench Production Build Is The GitHub Pages Product

**Status:** Accepted

`Apps/Workbench` 的 production build 本身就是 Volition GitHub Pages 发布站点。不得维护“宣传官网 + 另一个 localhost 编辑器”两套重复产品界面。

### Consequences

- Pages 根入口直接进入 Workbench Shell；
- 品牌、版本、About、文档入口属于 Workbench Shell；
- Offline Demo、portable config、Trace Inspector 在无 Bridge 时仍可使用；
- Pages 只托管静态前端资源，不成为 authoritative runtime、项目数据库或云端代理；
- production Pages 与本地正式 build 使用同一 artifact；
- HTTPS Pages 只承诺安全 transport（例如 `wss://`）；本地 `ws://` 调试能力必须与 production mode 明确区分。

---

## D-010 — TypeScript Workspace Is The First Reference Implementation, Not Product Semantics

**Status:** Accepted for Reference Slice 01

首个可运行纵向切片采用 npm workspaces、TypeScript、React、Vite 与 Vitest，以最快形成可测试、可部署的 Core → Schema → Protocol → Web Bridge → Workbench 链路。

### Consequences

- `Packages/Core`、`Packages/Schema`、`Packages/Protocol` 与 `Bridges/Web` 的首版 reference implementation 使用 TypeScript；
- `Apps/Workbench` 使用 TypeScript + React + Vite；
- 仓库只维护 npm lockfile，不并行引入 pnpm/yarn lockfile；
- TypeScript 类型、模块组织和 Web runtime 不是 Volition 永久跨引擎语义；
- Unreal/C++ 后续必须能依据相同 contracts 独立实现，而不嵌入 TypeScript runtime；
- Decision API 保持策略可插拔，Utility policy 只是 Tactical Wizard Slice 01 的首个实现。
