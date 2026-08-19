---
task_id: WILLFORM-TASK-UNCLAIMED-20260819-001
title: Willform Runtime Plugin Platform、Compiler Alpha 与 Workbench Live Authoring
recommended_owner: codex
eligible_owners: [codex]
implementation_owner: unassigned
claimed_by: ""
claimed_at: ""
status: queued
priority: critical
base_ref: main
user_gate_required: true
created_at: 2026-08-19
updated_at: 2026-08-19
reference_application: Syurli/TWR_Dev
reference_host: web
architecture_reference: Syurli/Worldform@cd6f9cc40e065129f6094cadfca6c11c527951a7
paired_task: TASK-UNCLAIMED-20260811-009
---

# Willform Runtime Plugin Platform、Compiler Alpha 与 Workbench Live Authoring

> 状态：queued / 尚未认领
> 任务性质：Willform 下一阶段平台主任务，不是单一 Tactical Wizard Demo 增量。
> 首个真实消费者：Syurli/TWR_Dev。
> 首个正式 Runtime Plugin：Tactical Squad Plugin。
> 首个 Bridge/Host：Web。
> 后续跨引擎验证：Unreal，其次按真实消费者需求决定 Unity/Godot。
> 设计参考：Worldform 的 API / SDK / Host、Workspace、Adapter、版本分层、打包和 Clean-room 模式。
> 核心目标：同一份 Willform AI 源资产经编译后，可以被不同宿主插件加载，并可由 Workbench 安全地连接、观察和原子热更新。

## 1. 任务背景

Willform 当前已经具备：

- Core/Schema/Protocol/Web Bridge 的 Alpha 基线；
- Agent、Squad、Behavior、Brain Supervisor、Reasoner 等 Authoring Asset；
- Workbench Projects、Design、Simulation、Debug、Visualization 和 Connection 页面；
- Tactical Wizard 完整度较高的战术小队参考模拟；
- Decision Trace、Run Log、IAUS、Commitment、Arbitration、Execution Ownership；
- 动态掩体、压力、恢复、后勤、投掷物安全和动态世界重规划样板；
- GitHub Pages/Offline Workbench 路线。

但当前仍存在以下平台缺口：

1. 完整小队战术主要位于 Apps/Workbench/src/simulation，尚未成为独立可分发 Runtime Plugin。
2. Packages/Core 当前 AgentRuntime 仍主要面向单 Agent 基础 Slice。
3. Schema 0.1 是实验性源格式，尚无独立 Compiler 和 Runtime Artifact。
4. Workbench Project 主要通过 LocalStorage 和直接对象编辑工作，缺少正式 Revision、Draft、Patch、History 和已部署版本。
5. Protocol 0.1 主要是 Host 到 Workbench 的单向 Telemetry，不支持配置 prepare/commit/rollback。
6. Web Bridge tick 当前混合决策、动作执行与异步 Telemetry，不适合作为所有固定 Tick 宿主的长期插件合同。
7. 没有通用 Plugin API / SDK / Host，也没有跨仓 Clean-room 插件开发流程。
8. Workbench 与浏览器游戏都无法可靠充当本地 WebSocket Server，需要通用 Live Companion。

本任务必须把 Willform 从“带有强大 Workbench 战术样板的 AI 框架”推进为“可编译、可插件化、可热更新、可跨引擎桥接的正式决策运行平台”。

## 2. 产品与架构决策

### 2.1 不是把 Workbench 复制给游戏

正式关系：

~~~text
Willform Authoring Source
        ↓ Workspace / Draft / Validate
Compiler
        ↓
Willform Runtime Artifact
        ↓
Runtime Plugin Host
        ↓
Tactical Squad Plugin
        ↓
Engine/Project Host Adapter
~~~

Workbench Simulation 和 TWR Runtime 都加载同一类 Runtime Artifact 与 Tactical Plugin，但各自拥有独立 Host Adapter。Workbench 的二维地图、A*、LOS、测试武器和表现不能进入 TWR；TWR 的 Voxel、Jolt、Weapon、Cover 和 Raid 类型也不能进入 Willform 公共包。

### 2.2 借鉴 Worldform，但不复制场景业务

必须采用以下平台模式：

- Plugin API：最小、稳定、transport-neutral；
- Plugin SDK：定义辅助、Schema、Fixture、Contract Test、模板；
- Plugin Host：加载、生命周期、版本检查、能力协商、超时、错误、热替换和回滚；
- Workspace：Source、Revision、Draft、Patch、History、Validate、Compile Preview；
- Consumer Adapter：留在消费者仓库；
- dist-only package；
- 仓库外安装和 Clean-room；
- 公共能力至少经过两个真实消费者再晋升 Core。

Worldform 的 SceneDocument/Patch 不能直接成为 Willform AI 数据模型；两者只共享工程原则。

### 2.3 Alpha 兼容策略

当前 0.1 仍属实验阶段。本任务允许：

- 提升 Source、Artifact、Plugin API 和 Protocol 版本；
- 对旧 Alpha 做一次明确迁移或直接拒绝；
- 删除无价值的旧接口；
- 不建立长期兼容层；
- 不保留两套平行 runtime/bridge API。

所有破坏性变化必须通过版本、迁移说明和测试表达，禁止静默兼容。

## 3. 权威数据分层

### 3.1 Authoring Source

建议文件继续使用 willform.project.json 或正式后继格式，包含：

- AgentDefinition；
- SquadDefinition；
- BehaviorDefinition；
- BrainSupervisorDefinition；
- ReasonerDefinition；
- Combat/Decision Profile；
- Doctrine；
- typed parameters；
- host-neutral capability 和 behavior reference；
- extensions。

Source 是设计权威，不是可直接 Tick 的运行对象。

### 3.2 Runtime Artifact

新增版本化 WillformRuntimeArtifact。第一版使用可审计 JSON，不提前引入二进制 VM 格式。

至少包含：

- artifactFormatVersion；
- sourceProjectId；
- sourceRevision；
- sourceHash；
- compilerVersion；
- pluginApiVersion；
- requiredRuntimePluginId/version range；
- requiredHostCapabilities；
- agent/squad entrypoints；
- normalized asset tables；
- resolved stable references；
- stateSchemaVersion；
- extensions；
- artifactHash。

禁止包含：

- Workbench React/UI 状态；
- Workbench Simulation Map；
- 浏览器 LocalStorage 信息；
- TWR 路径、武器 JSON、Babylon/Jolt/Vlox 对象；
- Unreal UObject、Unity GameObject 或 Godot NodePath；
- 任意可执行脚本字符串。

### 3.3 Runtime State

Runtime State 只存在于 Plugin Session，包括：

- Observation；
- Memory/Belief；
- current Supervisor mode；
- Decision/Proposal；
- Squad Doctrine state；
- Tactical Plan；
- Commitment/Lease；
- Arbitration；
- Execution Ownership；
- Action lifecycle；
- Trace cursor。

Runtime State 不自动写回 Source。热更新时只能按显式迁移策略保留、局部重置、全会话重置或拒绝。

## 4. 版本分层

必须分别管理：

1. Source project format version；
2. Runtime Artifact format/ABI version；
3. Runtime Plugin API version；
4. Live Protocol version；
5. Host Capability Schema version；
6. Plugin implementation version；
7. Compiler version；
8. Runtime session revision；
9. Source revision 和 Artifact hash。

不能继续用一个 version 或 schemaVersion 同时承担所有职责。

## 5. 建议包结构

最终命名可根据现有 workspace 风格调整，但职责必须保持：

~~~text
Packages/
  Core/
  Schema/
  Protocol/
  AuthoringWorkspace/
  Compiler/
  PluginApi/
  PluginSdk/
  PluginHost/
  TacticalRuntime/

Bridges/
  Web/
  LiveCompanion/
  Unreal/
  Unity/
  Godot/

Examples/
  PluginCleanRoom/
  TacticalWizard/

Templates/
  runtime-plugin-minimal/
  host-adapter-web/
~~~

TacticalRuntime 可以是 Reference Plugin，而不是自动晋升 Packages/Core。只有多个项目共同需要且无法合理留在插件层的语义，才进入 Core。

## 6. Plugin API / SDK / Host

### 6.1 Plugin Manifest

至少声明：

- id；
- displayName；
- pluginApiVersion；
- implementationVersion；
- supportedArtifactVersions；
- stateSchemaVersions；
- runtime kind；
- deterministic capability；
- supported entrypoint kinds；
- required/optional host capabilities；
- debug/telemetry capabilities。

### 6.2 Runtime Plugin

建议公共对象：

~~~text
WillformRuntimePlugin
  manifest
  initialize
  validateArtifact
  createSession
  dispose

WillformPluginSession
  tick
  getSnapshot
  getTrace
  prepareUpdate
  commitUpdate
  abortUpdate
  rollback
  reset
  dispose
~~~

要求：

- tick 是确定性同步决策入口；
- Telemetry 发送不在权威 tick 中 await；
- 所有输入按稳定 ID、logical tick 和 sequence 排序；
- 不调用 Date.now/Math.random 决定业务结果；
- reset/dispose 幂等；
- debug 读取为纯读取；
- Plugin 不直接执行宿主动作；
- Plugin 只产生 Intent/Proposal/Execution Request；
- Host Action Result 在后续 Tick 明确回传。

### 6.3 Host Adapter

Host Adapter 描述宿主提供什么，不描述 Transport。

建议能力域：

- identity；
- actor/squad facts；
- perception/stimulus；
- spatial query；
- navigation query；
- cover query；
- fire-lane query；
- action execution；
- world revision；
- time/seed；
- diagnostics。

每个能力使用 namespaced stable id、版本和 Schema。Tactical Plugin 缺少能力时必须 fail closed、禁用候选或降级 Doctrine，不得伪造结果。

### 6.4 Plugin SDK

必须提供：

- define helper；
- Schema helper；
- fixture；
- contract report；
- deterministic replay harness；
- host capability fixture；
- hot reload fixture；
- reset/dispose fixture；
- package template；
- 中文开发文档；
- 仓库外 Clean-room 流程。

## 7. Compiler Alpha

Compiler 输入 Source Project，输出 Runtime Artifact。

至少执行：

- Source Schema 校验；
- stable id 唯一性；
- reference resolution；
- Agent/Squad/Behavior/Reasoner/Supervisor 完整性；
- required capability 汇总；
- entrypoint 生成；
- portable parameter normalization；
- editor-only 字段剥离；
- artifact hash；
- source revision/hash 记录；
- deterministic ordering；
- diagnostics；
- migration/rejection。

禁止 Compiler：

- 读取游戏私有运行状态；
- 联网取得必需配置；
- 复制 TWR 数据；
- 执行 Source 中的脚本；
- 生成依赖 Workbench 的运行代码。

Workbench、CLI 和 CI 必须调用同一个 Compiler，不维护三套导出逻辑。

## 8. Workbench Authoring Workspace

当前 Local Project 模型升级为正式应用层：

~~~text
WillformAuthoringWorkspace
  sourceProject
  sourceRevision
  history
  draftChanges
  validation
  compiledPreview
  deployedRuntimeRevision
  previewChange
  applyChange
  discardChange
  undo
  redo
  compile
~~~

要求：

- 所有编辑器持久修改落为结构化 Patch；
- Draft 带 baseRevision；
- stale Draft 不静默覆盖；
- Workbench 页面不直接各自修改 config；
- Import/Export、Design、Simulation 和 Live Deploy 使用同一 Workspace；
- LocalStorage 只是存储 Adapter，不是状态权威；
- Offline Mode 完整可用；
- Live Mode 不改变 Source 权威和 History 语义。

## 9. Live Protocol 2

现有 Protocol 0.1 只保留为迁移参考。新协议必须双向并 transport-neutral。

### 9.1 消息域

Session：

- hello/handshake；
- peer role；
- pairing；
- capability negotiation；
- heartbeat；
- disconnect reason。

Deployment：

- artifact_offer；
- prepare_update；
- prepare_result；
- commit_update；
- update_applied；
- abort_update；
- rollback_request/result。

Control：

- pause；
- resume；
- step；
- reset；
- telemetry level；
- focus agent/squad。

Runtime：

- agent/squad inventory；
- runtime snapshot；
- trace batch；
- action lifecycle/result；
- plan/commitment/arbitration；
- performance sample。

Diagnostics：

- validation；
- compile；
- capability missing；
- migration；
- protocol；
- dropped telemetry；
- host world revision。

### 9.2 Envelope

至少携带：

- protocolVersion；
- sessionId；
- peerId；
- sequence；
- message type；
- request/correlation id；
- source timestamp 仅用于诊断；
- logical tick（运行消息）；
- payload schema version。

时间戳不得参与决策或确定性比较。

## 10. Live Companion

浏览器 Workbench 和 Web Game Runtime 都作为 Client 连接 Companion。

第一版要求：

- Loopback 默认绑定；
- 一次性 pairing code；
- 短时 session token；
- Editor/Host 角色配对；
- 多会话隔离；
- 有界消息队列；
- Telemetry 背压和采样；
- connection/reconnect 诊断；
- 不保存用户 AI 数据到云端；
- 不提供任意文件系统、Shell 或代码执行；
- 可从命令行一键启动本地 Workbench 与 Companion；
- 关闭 Companion 后 Runtime 继续使用当前 Artifact。

### 10.1 Pages 与本地模式

- 本地开发：Companion 可以同时服务本地 Workbench 与 ws endpoint，避免 mixed content；
- GitHub Pages：只能连接浏览器允许的 wss endpoint；
- 若可信 localhost wss 尚未完成，Pages 必须明确显示限制；
- 禁止要求用户关闭浏览器安全或安装不明证书；
- secure companion/证书方案需要单独 ADR 和用户 Gate。

## 11. 原子 Hot Reload

### 11.1 事务

~~~text
Draft
  ↓ validate
Compiled candidate Artifact
  ↓ offer
Host/Plugin prepare
  ↓ migration plan
User or Safe Auto Apply
  ↓ next safe logical tick
Atomic commit
  ↓
applied / rejected / rolled back
~~~

Host 不能直接 Apply 未经 prepare 的 Artifact。

### 11.2 迁移策略

- preserve_state：纯参数变化；
- reset_affected_agents：Agent/Squad/Behavior 结构变化；
- reset_session：ABI/State Schema/entrypoint 不兼容；
- reject：缺能力、版本、Hash、安全或资源预算不满足。

prepare 必须输出：

- changed scope；
- preserved state；
- reset state；
- cancelled actions；
- capability difference；
- estimated apply tick；
- rollback availability；
- warnings/errors。

### 11.3 动作与小队一致性

- 整个 Squad Runtime 使用同一 Artifact Revision；
- 禁止部分 Agent 已更新、部分未更新；
- 运行中 Action 的 preserve/cancel 必须由迁移计划声明；
- Commitment、Lease 和 Ownership 的迁移不能隐式猜测；
- commit 失败后旧 Runtime 继续工作；
- Rollback 必须记录恢复 Artifact 与状态策略；
- Telemetry 必须显示当前、候选和上一 Revision。

### 11.4 编辑体验

- 数值/Profile 参数可由用户启用 Safe Auto Apply，并进行短防抖；
- Squad 成员、Reasoner、Behavior、Supervisor 和 State Schema 变化必须手动 Apply；
- Workbench 必须显示 Candidate Validation、Migration Plan 和 Host Capability；
- 失败诊断要指出字段、能力、版本或运行状态原因；
- 不允许“编辑器显示成功但 Host 未应用”。

## 12. Tactical Squad Runtime Plugin

把 Tactical Wizard 完整战术能力按可移植语义和 Host 几何分离。

### 12.1 Plugin 拥有

- formation doctrine；
- contact memory、LKP、negative evidence；
- search doctrine；
- bounding、flank、crossfire、assault、sweep、regroup；
- role rotation；
- incoming-fire pressure；
- IAUS proposal/ranking；
- tactical plan/commitment；
- arbitration；
- execution ownership；
- fire-lane proposal/deconfliction；
- support/recovery/logistics decision；
- throwable safety decision；
- commander/reduced-pair/survivor downgrade；
- trace/run log semantics。

### 12.2 Host 拥有

- 地图、Occupancy 和几何；
- LOS/FOV/hearing；
- 具体路径、cover slot、flank point、assault point；
- 移动、碰撞、动画；
- 武器、弹药、投掷物和伤害；
- Voxel、Jolt、破坏；
- Navigation、Cover 和 Fire Lane 查询实现；
- ActionResult。

### 12.3 能力降级

Artifact/Plugin 必须声明 required/optional capability：

- 缺少 Cover 时禁用依赖 Cover 的候选；
- 缺少 Throwable 时不规划投掷；
- 缺少 Recovery/Logistics 时不伪造完成；
- 缺少动态 Navigation 时只能使用 Host 明确提供的静态路径能力；
- capability 变化通过 Trace 和 Workbench 显示。

### 12.4 当前 Workbench 迁移

迁移不得一次性复制整个 Apps/Workbench/src/simulation：

1. 先列出 portable decision semantics；
2. 再列出 Workbench-only geometry/world/execution；
3. 为每个模块建立 import boundary test；
4. Tactical Plugin 不 import React、DOM、Canvas、Workbench pages、test map 或 navigation.ts 具体后端；
5. Workbench Simulation 改为该 Plugin 的 Reference Host。

## 13. Web Bridge Reference

Bridges/Web 升级为首个正式 Host Bridge，但保持通用：

- stable Host id ↔ Agent/Squad id；
- Host facts/stimuli/query adapters；
- Action executor；
- Artifact load；
- Plugin Session lifecycle；
- Live Companion client；
- Telemetry；
- reset/dispose；
- Offline local Artifact。

权威 Tick 和 Telemetry 必须解耦。Bridge 不能因为网络慢而阻塞 Agent decision。

## 14. Developer Kit 与 Clean-room

在 TWR 联调前必须先建立仓库外 Clean-room：

1. 只安装 dist-only package；
2. 不修改 Willform 源码；
3. 使用最小 Web Host；
4. 实现 Host Adapter；
5. 加载 Runtime Artifact；
6. fixed tick；
7. ActionResult 回传；
8. Workbench 配对；
9. 实时参数更新；
10. 结构更新与 reset；
11. rollback；
12. disconnect 后继续离线；
13. deterministic replay；
14. 契约报告。

必须提供：

- Runtime Plugin 开发 Skill；
- Host Adapter 开发 Skill；
- 模板；
- API/SDK/Host 文档；
- Protocol/Companion 文档；
- Artifact/Compiler 文档；
- 兼容矩阵；
- 仓库外安装报告。

## 15. 与 TWR 配对任务的边界

TWR 配对任务为：

~~~text
TASK-UNCLAIMED-20260811-009
TWR AI 插件宿主、Willform 实时联动与可破坏 AI 测试区
~~~

Willform 交付给 TWR：

- Plugin API/SDK/Host package；
- Compiler；
- Runtime Artifact Schema；
- Tactical Squad Plugin；
- Protocol；
- Live Companion；
- Web Bridge；
- contract fixture；
- exact version/commit；
- migration and security docs。

TWR 交付给 Willform：

- Host capability manifest；
- filtered facts/stimuli；
- action executor；
- world/navigation/cover revision；
- sanitized telemetry；
- 真实战场测试证据。

Willform 仓库禁止直接修改 TWR 代码；TWR 仓库禁止复制 Willform 源码。

## 16. 与 Worldform 和其它百舸框架的未来关系

Worldform、Willform、Flowform 独立成立：

- Worldform：世界如何描述、构造、调度和引用；
- Willform：Agent/Squad 如何认知、决策和计划；
- Flowform：角色如何产生运动；
- 游戏/引擎：世界和动作执行权威。

未来 Worldform Project Adapter 可以保存：

- willformArtifactId；
- squadEntryId；
- spawnBinding；
- initialProfileId。

但 Worldform Core 不包含 Willform 完整项目，Willform Workbench 也不成为关卡编辑器。跨产品引用必须使用 stable artifact/resource reference 和 capability validation。

只有 Web/TWR 以及第二真实宿主都需要的桥接语义，才考虑晋升公共层。

## 17. 跨引擎路线

### Phase 1：Web/TWR

- Web Clean-room；
- TWR Reference Bridge #1；
- Workbench Live Authoring；
- Offline shipping Artifact；
- deterministic replay。

### Phase 2：Headless/CI

- Node/headless Host；
- batch simulation；
- behavior diff；
- fixed-seed regression；
- performance/trace report。

### Phase 3：Unreal

现有 Unreal Bridge 骨架在 Plugin API 经 Web/TWR 验证后继续：

- C++ Host Adapter；
- Artifact Loader；
- AI Controller/Nav/Gameplay Ability 映射；
- Editor Live Companion；
- Trace Debugger；
- 不嵌入 Web/TWR 类型。

### Phase 4：Unity/Godot

只有出现真实消费者后建立，不提前实现空壳功能。第二引擎反馈若证明 API 通用缺口，再按版本规则修改公共层。

## 18. 分阶段执行

### W0：现状审计与 ADR

- 对 Workbench tactical modules 做 portable/host-only 清单；
- 冻结 Source/Artifact/Runtime State；
- 冻结 API/SDK/Host；
- 冻结版本分层；
- 冻结 Live security 和 Hot Reload；
- 同步 Architecture、Roadmap、Product 和 ADR。

阶段结束进入用户 Gate W0，不立即大规模迁移。

### W1：Authoring Workspace

- Revision、Draft、Patch、History；
- Validate/Preview/Apply/Discard；
- Workbench 页面统一接入；
- Import/Export；
- Offline regression。

### W2：Compiler Alpha

- Source → Artifact；
- deterministic normalization；
- diagnostics/hash/capability；
- CLI；
- fixtures；
- no Workbench runtime dependency。

### W3：Plugin API/SDK/Host

- manifest；
- plugin/session lifecycle；
- host capability；
- action result；
- contract tests；
- minimal template。

### W4：Tactical Squad Plugin

- 提炼 portable modules；
- Workbench Simulation 改为 Reference Host；
- 保留现有完整战术回归；
- capability gating；
- fixed tick performance。

### W5：Protocol 2 与 Companion

- 双向协议；
- pairing；
- backpressure；
- control/telemetry/deployment；
- local Workbench launcher；
- security tests。

### W6：Hot Reload

- prepare/commit/abort/rollback；
- state migration；
- atomic squad revision；
- failure recovery；
- UI diagnostics。

### W7：Web Clean-room

- dist-only package；
- external host；
- offline/live；
- contract/replay；
- package report。

### W8：TWR 集成 Gate

- 发布精确版本和 SHA；
- 提供 TWR fixture；
- 与 TWR 配对任务进入用户批准的双仓联调；
- Willform 不直接改 TWR。

### W9：跨引擎决策

- 根据 Web/TWR 数据决定 Unreal Bridge 的最小正式范围；
- 不在本任务直接完成 Unreal/Unity/Godot 生产实现。

## 19. 编辑器 UI 门控

本任务会新增 Workbench Workspace、Deployment、Connection、Migration 和 Runtime Revision 界面。

进入 UI 编码前必须：

1. 向用户提供字符打印布局示例；
2. 展示 Offline、Connected、Pending Update、Migration Review 和 Rejected 五种状态；
3. 区分 Source Revision、Compiled Artifact 和 Runtime Revision；
4. 展示参数 Safe Auto Apply 与结构 Manual Apply 的差异；
5. 获得用户确认后再实现。

到达该点状态改为 waiting_user，不自行决定最终面板排版。

## 20. 允许修改范围

领取后先写精确 write_set。预期范围：

~~~text
Packages/Core/**
Packages/Schema/**
Packages/Protocol/**
Packages/AuthoringWorkspace/**
Packages/Compiler/**
Packages/PluginApi/**
Packages/PluginSdk/**
Packages/PluginHost/**
Packages/TacticalRuntime/**
Bridges/Web/**
Bridges/LiveCompanion/**
Apps/Workbench/**
Examples/PluginCleanRoom/**
Examples/TacticalWizard/**
Templates/**
Tests/**
Scripts/**
Docs/**
.agents/skills/**
package.json
package-lock.json
tsconfig.json
相关 README
本任务文件
~~~

不得一次性把全部范围视为并行授权。每个 W 阶段结束后重新检查工作区和冲突。

## 21. 禁止事项

- 不修改 TWR 仓库；
- 不把 TWR/Babylon/Jolt/Vlox/React/DOM 类型放进通用 Plugin API；
- 不把 Workbench 2D world 或 navigation 迁入 Tactical Plugin；
- 不让 Protocol/Companion 参与业务决策；
- 不要求 Shipping 联网；
- 不执行 Workbench 发来的任意代码；
- 不提供任意文件、Shell、网络代理或插件下载执行；
- 不维护旧 API 与新 API 两套长期实现；
- 不提前实现完整 Unreal/Unity/Godot；
- 不建立万能 Generic Reasoner Graph；
- 不把 Utility/BT/HTN/GOAP 强制压成一种节点语义；
- 不新增无任务依据的第三方 Runtime 依赖；
- 不修改 dist/node_modules 或二进制产物；
- 不关闭 typecheck/test/build 来完成迁移。

## 22. 验收标准

### Source/Compiler/Artifact

1. Source、Artifact、Runtime State 明确分离。
2. Compiler 输出确定性 Artifact 和 Hash。
3. 未知/不兼容版本显式拒绝或迁移。
4. Artifact 不包含 Workbench/TWR/引擎对象。
5. CLI、Workbench、CI 共用 Compiler。

### Plugin Platform

6. API、SDK、Host 分离。
7. Plugin 可在仓库外实现和测试。
8. fixed tick 不 await Telemetry/Transport。
9. reset/dispose 幂等。
10. Host capability 缺失会显式降级或拒绝。
11. 相同输入、seed、Artifact 产生相同决策流。

### Tactical Plugin

12. Workbench 完整小队行为通过新 Plugin 运行。
13. Tactical Plugin 不 import Workbench world/map/navigation/UI。
14. Squad Revision 原子一致。
15. Cover/Throwable/Recovery/Navigation 能力可独立协商。

### Live Authoring

16. Workbench 能连接 Web Clean-room Host。
17. 参数修改可 prepare/commit。
18. 结构修改显示迁移计划。
19. Commit 只在安全 Tick 边界生效。
20. 失败后旧 Runtime 继续运行。
21. Rollback 可验证。
22. Disconnect 不改变 AI。
23. Telemetry 开关不改变决策。

### Security/Distribution

24. Companion 默认 Loopback 和一次性配对。
25. 不存在任意代码执行通道。
26. dist-only 包可在仓库外安装。
27. 无源码路径和本机绝对路径依赖。
28. Shipping Artifact 可完全离线运行。

### Developer Experience

29. Plugin/Host Adapter 模板可用。
30. 中文文档和公共接口注释完整。
31. Contract、Replay、Hot Reload 和 Cleanup 测试齐全。
32. Clean-room 报告可复现。

## 23. 验证命令

实现阶段至少执行：

~~~bash
npm run typecheck
npm run test
npm run build
npm run pack:reference
~~~

若新增 package/companion/compiler 命令，应登记 package.json，并在最终 Gate 运行：

- package build；
- dist-only pack；
- 仓库外 clean install；
- compiler deterministic repeat；
- plugin contract；
- host capability；
- fixed tick replay；
- hot reload prepare/commit/reject/rollback；
- companion pairing/security/backpressure；
- disconnect/reconnect；
- reset/dispose/soak；
- Workbench offline build；
- Workbench live browser smoke；
- TWR package consumption smoke（由配对任务执行）。

不得声称未执行的 Pages、移动端、Unreal 或 TWR 运行结果已经通过。

## 24. 用户门控

### Gate W0：平台合同

用户确认 Source/Artifact/State、API/SDK/Host、版本和 Hot Reload 策略。

### Gate W-UI：Workbench 布局

实施者提交字符打印布局并等待用户确认。

### Gate W4：Tactical Plugin

用户确认现有完整小队能力没有因迁移丢失，Workbench Host 边界正确。

### Gate W6：Live Authoring

用户确认 Auto Apply、Manual Apply、Migration 和 Rollback 体验。

### Gate W7：Developer Kit

用户确认 Clean-room 和分发方式可作为第三方 Bridge 基础。

### Gate W8：TWR 联调

用户明确开启双仓集成窗口后才与 TWR 对接。

到达门控时完成阶段报告，状态改为 waiting_user，停止继续，不轮询另一个仓库或 AI。

## 25. 文档输出

至少新增或更新：

~~~text
Docs/ARCHITECTURE.md
Docs/ROADMAP.md
Docs/PRODUCT.md
Docs/WEB_WORKBENCH.md
Docs/WORKBENCH_PROJECTS.md
Docs/PLUGIN_PLATFORM.md
Docs/RUNTIME_ARTIFACT.md
Docs/LIVE_AUTHORING.md
Docs/THIRD_PARTY_PLUGIN_INTEGRATION.md
Docs/COMPATIBILITY.md
Docs/PACKAGING.md
Docs/Architecture/ADR-*-runtime-plugin-platform.md
Docs/Architecture/ADR-*-compiler-artifact-state.md
Docs/Architecture/ADR-*-live-companion-security.md
Docs/Architecture/ADR-*-atomic-hot-reload.md
相关 Package/Bridge README
本任务文件
~~~

若文件命名按现有仓库风格调整，必须在阶段报告说明。

## 26. 开始前强制读取

~~~text
AGENTS.md
README.md
Docs/PRODUCT.md
Docs/ARCHITECTURE.md
Docs/ROADMAP.md
Docs/WEB_WORKBENCH.md
Docs/WORKBENCH_PROJECTS.md
Docs/Architecture/ADR-0002-Willform-Authoring-and-Squad-Doctrine-Boundaries.md
Packages/Core/**
Packages/Schema/**
Packages/Protocol/**
Bridges/Web/**
Apps/Workbench/src/projects.ts
Apps/Workbench/src/connection.ts
Apps/Workbench/src/simulation/CURRENT_RUNTIME.md
Apps/Workbench/src/simulation/**
Examples/TacticalWizard/**
本任务文件
~~~

同时只读核对：

~~~text
Syurli/Worldform@cd6f9cc
  AGENTS.md
  docs/ARCHITECTURE.md
  docs/PROJECT_ADAPTER.md
  docs/THIRD_PARTY_INTEGRATION.md
  docs/PACKAGING.md
  docs/COMPATIBILITY.md
  docs/decisions/ADR-007-ADAPTER-API-SDK-HOST.md

Syurli/TWR_Dev
  AGENTS.md
  TASK-UNCLAIMED-20260811-009
~~~

Worldform 只作为平台工程参考，不建立运行依赖。

## 27. 阶段报告

每个 Gate 必须报告：

1. 修改/新增文件；
2. 公共 API、版本和迁移影响；
3. Source/Artifact/Runtime State 所有权影响；
4. 实际执行验证；
5. 未执行验证；
6. 已知问题；
7. 下一阶段需要的用户或 TWR 输入；
8. 是否到达用户门控；
9. 当前 package/version/commit；
10. 是否存在 Clean-room 或跨仓证据。

## 28. Definition of Done

任务只有在以下结果全部成立时才可关闭：

- Willform 拥有正式 Runtime Plugin Platform；
- Workbench 源编辑经过 Workspace/Draft/History；
- Source 可编译为版本化 Runtime Artifact；
- Tactical Squad 通过独立 Plugin 运行；
- Web Clean-room Host 不修改 Willform 即可接入；
- Workbench 能双向连接、观察和部署；
- Hot Reload 原子、可迁移、可拒绝、可回滚；
- Companion 安全边界通过；
- dist-only package 和仓库外安装通过；
- TWR 获得固定版本联调包；
- Runtime 在 Workbench/Companion 关闭后继续离线执行；
- 所有公共接口和非直观生命周期具有完整中文注释；
- 未将 TWR、Workbench Host 或具体引擎语义污染公共层；
- 用户完成所有必要 Gate。
