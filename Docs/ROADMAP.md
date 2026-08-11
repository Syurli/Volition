# Volition Initial Roadmap

> 初始化阶段的里程碑地图，不是发布日期承诺。

## Phase 0 — Platform Foundation

目标：让仓库形态与产品真实边界一致。

- [x] 确认产品命名：能动 Volition
- [x] 确认厂牌：A BAIGE Project
- [x] 仓库从 Unreal 插件结构重构为平台 monorepo
- [x] 独立 `Apps/Workbench`
- [x] 建立 `Packages/Core`、`Packages/Schema`、`Packages/Protocol` 边界
- [x] 建立 Unreal / Unity / Godot / Web Bridge 目录
- [x] 明确浏览器优先、引擎轻桥接原则
- [ ] 确认开源 / 商业许可证策略
- [ ] 确认首批语言、包管理与 CI 技术栈

**Exit Criteria**：任何新功能都能明确归属 Workbench、Portable Package 或某个 Bridge，而不是默认塞进 Unreal 插件。

## Phase 1 — Portable Contracts

目标：先固定跨引擎通信与配置的最小语言。

- Volition project / config version
- Agent ID / definition
- Context key/value 与 provider contract
- Intent / Behavior reference
- Resource / Request identity
- engine extension namespace
- Protocol handshake / capability negotiation
- snapshot / telemetry message envelope
- schema fixtures 与兼容测试

**Exit Criteria**：同一份最小 Agent 配置可以被 Web reference bridge 与 Unreal Bridge 解释；实时连接可以完成 handshake 和 Agent inventory。

## Phase 2 — Workbench Shell

目标：建立独立浏览器工具的最小可运行产品壳层。

- Project open / recent projects
- Connection manager
- Agent list / basic inspector
- portable config viewer/editor
- schema validation
- runtime snapshot panel
- trace/timeline 基础容器

**Exit Criteria**：无需打开引擎内复杂编辑器，即可浏览配置并连接一个测试 Bridge。

## Phase 3 — Unreal End-to-End Slice

目标：用首个生产 Bridge 验证整个架构，而不是让 Unreal 定义架构。

- `VolitionUnrealBridge` 最小运行模块
- `VolitionUnrealEditor` 项目设置与 Workbench 启动/连接入口
- Agent host registration
- Context provider adapter
- portable config loader
- live telemetry transport
- 一个最小 Behavior execution adapter
- StateTree adapter 作为候选后端

**Exit Criteria**：Workbench 编辑/读取配置 → Unreal 加载 → Agent 执行 → telemetry 回到 Workbench，形成完整往返。

## Phase 4 — Decision, Scheduling & Ownership

目标：完成 Volition 的核心 Agent 运行语义。

- Agent lifecycle
- Decision Policy
- Intent selection
- Priority / Scheduler
- Request / Resource / Ownership
- Acquire / Release / Cancellation
- selection/rejection reason
- deterministic tests / failure cleanup

**Exit Criteria**：多个候选行为竞争时结果稳定、可测试、可解释，并可在 Workbench 中观察原因。

## Phase 5 — Web Authoring & Debugging

目标：将主要开发体验完整放到浏览器端。

- Decision / Intent view
- Behavior configuration
- Resource / Request graph
- Scheduler trace
- Timeline / history
- validation diagnostics
- configuration diff / import / export
- profile / performance view

**Exit Criteria**：常见 Agent 行为和资源竞争问题无需进入引擎自定义 Debugger 即可定位。

## Phase 6 — Additional Bridges

目标：验证跨引擎设计不是文档假设。

### Web Bridge

优先作为轻量 reference host 与自动化验证环境。

### Unity Bridge

建立 Package、host mapping、config loading、telemetry 与最小 execution adapter。

### Godot Bridge

建立 Addon、Node/Resource mapping、config loading、telemetry 与最小 execution adapter。

**Exit Criteria**：至少两个非 Unreal Host 能加载同一 portable config，并通过同一 Workbench/Protocol 被观察。

## Phase 7 — Public 2.0 Candidate

- 示例工程 / reference projects
- API / Schema / Protocol 文档
- 性能 profiling
- Bridge capability matrix
- 错误处理与版本迁移
- 发布与打包流程
- License 与第三方依赖清单

**Exit Criteria**：真实项目可集成、可调试、可升级，共享配置和核心工作流有自动验证。

## Later Exploration

- Utility AI 标准实现
- World / Squad / Director 层调度
- Mass / ECS integrations
- 网络复制
- Save / restore runtime state
- LLM / planner integration
- remote collaborative debugging
