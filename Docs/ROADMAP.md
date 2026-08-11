# Volition Initial Roadmap

> 初始化阶段的里程碑地图，不是发布日期承诺。

## Validation Order

```text
Tactical Wizard / Web
        ↓
验证 Core / Schema / Protocol / Workbench / Trace
        ↓
Unreal
        ↓
验证真正的跨引擎、跨语言可移植性
        ↓
Unity / Godot
```

Reference Application #1 是 `Syurli/TWR_Dev` / 《战术巫师：裂隙突围》。Unreal 保持第二个重要生产验证 Host；现有 Unreal Bridge 不删除。

## Phase 0 — Platform Foundation

目标：让仓库形态与产品真实边界一致。

- [x] 确认产品命名：能动 Volition
- [x] 确认厂牌：A BAIGE Project
- [x] 仓库从 Unreal 插件结构重构为平台 monorepo
- [x] 独立 `Apps/Workbench`
- [x] 建立 `Packages/Core`、`Packages/Schema`、`Packages/Protocol` 边界
- [x] 建立 Unreal / Unity / Godot / Web Bridge 目录
- [x] 明确浏览器优先、引擎轻桥接原则
- [x] 冻结 Reference Slice 01 工具链：npm workspaces + TypeScript + React/Vite + Vitest
- [x] 明确 GitHub Pages = `Apps/Workbench` production app
- [ ] 确认开源 / 商业许可证策略

**Exit Criteria**：任何新功能都能明确归属 Workbench、Portable Package 或某个 Bridge，而不是默认塞进 Unreal 插件。

## Phase 1 — Tactical Wizard Reference Slice 01

目标：用真实游戏需求先得到可运行、可解释、可部署的 Agent 闭环，而不是提前建立大而全 AI 编辑器。

- Minimal portable Agent runtime：create / tick / reset / dispose
- Context / Stimulus / Observation / Memory / Belief
- pluggable Decision Policy；首版 Utility + explicit behavior state
- Intent / ActionIntent / ActionResult lifecycle
- DecisionTrace：candidate scores、rejection、selection、cancellation、action result
- versioned Agent/config Schema
- transport-neutral Protocol：handshake、inventory、snapshot、trace
- generic Web Host Bridge
- deterministic Tactical Wizard generic rifle fixture
- Workbench Runtime Inspector + Trace Timeline + Connection Manager
- GitHub Pages production deployment

**Reference behavior**：

```text
Patrol → Hear/Perceive → Investigate → Visual Confirm → Engage
       → Lose Target → Search Last Known Information → Confidence Decay → Patrol
```

**Exit Criteria**：同一固定 fixture 稳定生成同一 decision stream；Pages 无游戏运行时也能完整演示 Agent config、runtime snapshot 和“为什么这样做”的 Trace。

## Phase 2 — Tactical Wizard Game-side Integration

目标：在 TWR 仓库的独立 integration boundary 中消费 Volition contracts，不让 Volition 接管宿主世界与战斗规则。

- TWR stable actor id ↔ Volition Agent id
- Host Context / Stimulus adapter
- Host Action executor：MoveTo / AimAt / Fire / Reload
- telemetry sanitizer
- Legacy Golden Reference 对照
- 单个普通持枪敌人的 `legacy | volition` 开发态切换

**Gate**：进入 TWR 的 `I-Combat` 串行集成窗口前必须由用户批准，并避开其它正在修改 combat/Raid 共享面的任务。

## Phase 3 — Unreal Production Validation #2

目标：证明 Volition contracts/runtime 不是 TypeScript/Web 专用实现。

- `VolitionUnrealBridge` host registration / context / config / telemetry
- C++ 侧 contract/runtime strategy
- 一个最小 Behavior execution adapter
- StateTree 可作为 execution backend，但不定义 Volition Core
- Workbench ↔ Unreal round trip

**Exit Criteria**：同一 portable semantics 可以由 Unreal/C++ Host 解释与执行，不依赖 TypeScript runtime。

## Phase 4 — Scheduling & Ownership From Real Pressure

只在 Tactical Wizard/Unreal 出现真实竞争需求后扩展：

- Scheduler
- Request / Resource / Ownership
- Acquire / Release / Cancellation
- weapon / movement / spell / cover 等资源竞争

不在 Slice 01 预建大型调度器。

## Phase 5 — Workbench Expansion

在 Runtime Inspector 已验证后再扩展：

- Behavior configuration
- Resource / Request graph
- richer Timeline / history
- validation diagnostics
- configuration diff / import / export
- profile / performance view

大型 Behavior Graph / 通用节点 IDE 不属于首个垂直切片。

## Phase 6 — Additional Bridges

### Unity Bridge

建立 Package、host mapping、config loading、telemetry 与最小 execution adapter。

### Godot Bridge

建立 Addon、Node/Resource mapping、config loading、telemetry 与最小 execution adapter。

**Exit Criteria**：至少两个非 Web Host 能加载同一 portable semantics，并通过同一 Workbench/Protocol 被观察。

## Phase 7 — Public 2.0 Candidate

- 示例工程 / reference projects
- API / Schema / Protocol 文档
- 性能 profiling
- Bridge capability matrix
- 错误处理与版本迁移
- 发布与打包流程
- License 与第三方依赖清单

## Later Exploration

- Cover / Flank / Suppression policy
- World / Squad / Director
- Mass / ECS integrations
- 网络复制
- Save / restore runtime state
- LLM / planner integration
- remote collaborative debugging
