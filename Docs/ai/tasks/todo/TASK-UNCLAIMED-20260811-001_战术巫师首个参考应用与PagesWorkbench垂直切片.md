---
task_id: WILLFORM-TASK-UNCLAIMED-20260811-001
title: 战术巫师首个参考应用与 GitHub Pages Workbench 垂直切片
recommended_owner: codex
eligible_owners: [codex]
implementation_owner: codex
claimed_by: "codex"
claimed_at: "2026-08-11T17:15:00+08:00"
status: completed
priority: high
base_ref: main
user_gate_required: true
created_at: 2026-08-11
updated_at: 2026-08-11
completed_at: "2026-08-11T17:38:00+08:00"
reference_application: Syurli/TWR_Dev
reference_host: web
---

# 战术巫师首个参考应用与 GitHub Pages Workbench 垂直切片

> 状态：`completed` / `codex`  
> 实现分支：`codex/tactical-wizard-reference-slice-001`  
> Draft PR：`Syurli/Willform#1`  
> CI：TypeScript typecheck、5 个 test files / 15 tests、Workbench production build、reference package packing 均通过  
> Pages：deployment workflow 已实现；截至 2026-08-11 仓库 Pages API 返回 404，仓库设置尚未启用，因此不声称已上线  
> TWR 双仓联调：已产出 `npm run pack:reference`；AI-HOST-2 仍受 TWR 独立任务的用户批准 `I-Combat` Gate 约束，本任务未越权修改 TWR  
> 产品：**能动 Willform — Agent Decision & Behavior Framework**  
> 首个真实 Reference Application：`Syurli/TWR_Dev` / 《战术巫师：裂隙突围》  
> 首个 Reference Host：Web  
> 第二生产验证 Host：Unreal（后续，不在本任务实现）

## 1. 任务背景

Willform 当前已经完成平台级目录与职责边界：

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
Tests
```

但真正的 portable runtime、Schema、Protocol、Web Bridge 和 Workbench 仍未正式落地。

《战术巫师》当前恰好已有可运行的训练态 AI、视觉/声音感知、导航、武器和小队警戒，因此本任务使用它作为 Willform 的第一个真实需求方与压力测试，而不是继续以假想 Demo 设计框架。

核心开发方式：

```text
Tactical Wizard 提供真实需求与 Host 事实
        ↓
Willform 抽象可移植 Agent 语义
        ↓
Web Reference Host / Fixture 验证
        ↓
Tactical Wizard Game-side Adapter 接入
        ↓
Workbench 调试与解释
        ↓
后续 Unreal 验证跨引擎
```

本任务对应《战术巫师》仓库中的配套任务：

```text
Docs/ai/tasks/todo/
TASK-UNCLAIMED-20260811-009_能动Willform首个游戏端参考接入_AIHost边界与Legacy基线.md
```

两边任务必须保持边界：**Willform 不实现 TWR 世界与战斗；TWR 不再实现新的正式 Agent cognition/decision framework。**

## 2. 本任务必须先冻结的产品决策

### 2.1 Tactical Wizard 改为 Reference Application #1

当前 `Docs/ROADMAP.md` 中 Unreal-first 的验证顺序需要在本任务开始时正式校准：

```text
Reference Application #1: Tactical Wizard / Web
Reference Production Validation #2: Unreal
Additional Validation: Unity / Godot
```

含义：

- Web/TWR 用于最快验证 Core、Schema、Protocol、Workbench 和 Agent runtime；
- Unreal 仍是首个重要生产 Bridge，但职责变为证明 Willform 不是 TypeScript/Web 专用框架；
- 不删除现有 Unreal Bridge 空壳；
- 不让 TWR 的代码结构反向成为 Willform Core 的定义来源。

该决策必须记录到 `Docs/DECISIONS.md`，并同步 `Docs/ROADMAP.md`。

### 2.2 Willform Workbench 就是 GitHub Pages 发布网页

这是本任务的**硬约束**。

禁止设计为：

```text
GitHub Pages 宣传官网
        +
另一个 localhost / 内部网页编辑器
```

正式结构必须是：

```text
GitHub Pages
    ↓
Apps/Workbench production build
    ↓
Willform Workbench 本体
```

也就是说，用户打开 Willform 的 GitHub Pages 后看到的就是正式发布版 Workbench：

- 产品首页/项目入口只是 Workbench Shell 的一部分；
- 可以进入 Demo、打开 portable config、检查 Agent、查看 Trace；
- 后续 Live Bridge 连接也从同一个 Workbench 进入；
- 不维护第二套功能重复的“官网 UI”；
- 文档/品牌/版本信息可以嵌入 Workbench，但不能取代编辑器本体。

必须同步更新：

- `Docs/WEB_WORKBENCH.md`；
- `Apps/Workbench/README.md`；
- 必要时 `README.md` / `Docs/PRODUCT.md` 中的发布说明。

### 2.3 Pages 是静态发布，不得变成 Runtime 后端

GitHub Pages 只承载静态 Workbench 资源：

- HTML / JS / CSS / 静态示例；
- portable config 的浏览器编辑、导入、导出；
- Trace fixture / demo；
- Bridge Connection Manager 前端。

Pages 不拥有：

- 游戏 AI runtime；
- Agent authoritative state；
- 用户项目后端数据库；
- TWR 世界状态；
- 强制在线服务。

游戏运行时和 Bridge 在 Workbench 完全关闭时仍必须工作。

## 3. 浏览器安全与 Live Connection 约束

GitHub Pages 生产站点通过 HTTPS 提供服务。浏览器可能阻止从 HTTPS 页面直接连接不安全的 `ws://` / `http://` 本地或局域网端点。

因此本任务必须显式区分：

### Pages production mode

- Offline authoring / fixture / trace inspection 必须完整可用；
- Live endpoint 至少支持可安全连接的 `wss://` 或后续批准的安全 transport；
- 对浏览器 Mixed Content / CORS / secure context 限制给出明确诊断；
- 禁止为了绕过浏览器安全限制偷偷加入云端代理或上传用户运行数据。

### Local development mode

- 本地开发服务器可以作为调试 transport 的验证环境；
- 如果首版 TWR 本地 Bridge 只能通过开发环境连接，要在 UI 和文档明确标记，不得伪装为 Pages 已支持；
- 后续若需要 secure localhost companion / certificate / native bridge，应建立独立任务和 ADR。

**Pages 是正式 Workbench，并不等于本任务必须解决所有未来本地安全传输问题。**

## 4. Willform 与 Tactical Wizard 的边界

### Tactical Wizard Host 拥有

```text
world state
actor identity / position / facing
health / equipment / weapon facts
NoiseEvent
LOS / spatial queries
navigation / reachability
physics / voxel world
combat execution
ActionResult
```

### Willform 拥有

```text
Agent lifecycle
Context interpretation
Stimulus / Observation
Memory / Belief
Decision candidates
Intent selection
Behavior reference
Action intent
Decision / Action Trace
```

后续才扩展：

```text
Scheduler
Request
Resource
Ownership
Squad / Director
```

### 禁止依赖

`Packages/Core`、`Packages/Schema`、`Packages/Protocol` 和 Workbench 通用代码不得 import：

- Tactical Wizard 类型；
- Babylon.js；
- JoltPhysics.js；
- Vlox；
- Unreal / Unity / Godot SDK；
- TWR 的 `EnemyAiController` / `CombatTestRaidSession`。

TWR-specific 内容只能存在于：

- TWR 仓库自己的 integration adapter；
- Willform 的示例 fixture / 文档中以普通 portable data 表达。

## 5. 首版技术栈决策范围

Willform 当前尚未冻结 Core 实现语言和仓库构建栈。本任务需要为了第一个可运行 Slice 做一次**参考实现选择**，但不能把它误写成所有未来 Bridge 的永久语言约束。

推荐首版：

- portable reference implementation：TypeScript；
- Workbench：TypeScript + React + Vite；
- Core/Schema/Protocol：普通 TypeScript package，不依赖 React；
- Web Bridge：TypeScript；
- monorepo package manager：只选择一种并记录 ADR，不同时引入 npm/pnpm/yarn 多套 lockfile；
- 测试：选择与该 workspace 一致的轻量 TypeScript test runner；
- Pages：GitHub Actions 构建并部署 `Apps/Workbench` production artifact。

如果实现时仓库已经由其它批准任务冻结了技术栈，则复用已发布决定，不重新选型。

必须记录：

> TypeScript 是首个 reference implementation，不等于未来 Unreal/C++、Godot、Unity 必须嵌入 TypeScript runtime。

## 6. 第一版 Portable Core 合同

本任务只实现支撑 Tactical Wizard Agent Slice 01 的最小概念，不提前做万能 AI 平台。

至少定义：

```text
AgentId
TickContext
ContextSnapshot
Stimulus
Observation
MemoryRecord
Belief
DecisionCandidate
DecisionResult
Intent
BehaviorReference
ActionIntent
ActionResult
DecisionTrace
```

建议关系：

```text
Host Facts / Stimuli
      ↓
Observation
      ↓
Memory
      ↓
Belief
      ↓
Decision Candidates
      ↓
Selected Intent
      ↓
Behavior / Action Intent
      ↓
Host Execution
      ↓
Action Result
      ↓
Trace
```

### 6.1 Context

只允许 engine-neutral 数据：

- primitive / versioned value；
- stable IDs；
- engine-neutral vector/transform/value types；
- capability references；
- extension namespace。

不得出现 `UObject / GameObject / NodePath / Babylon Mesh`。

### 6.2 Stimulus / Observation

首版至少覆盖：

- `visual_actor`；
- `noise`；
- `damage_received`（如 Host 提供）；
- `ally_report` / `squad_report` 可以先定义最小扩展点，但不要求本任务完成完整 Squad AI。

视觉或听觉输入不能等价为“永远提供目标真实世界坐标”。

### 6.3 Memory / Belief

至少支持一个目标的：

```text
lastSeenPosition
lastSeenTick
lastHeardPosition
lastHeardTick
confidence
hostility / target relation
```

以及确定性信息衰减。

首版不需要通用知识图谱、向量数据库或 LLM Memory。

### 6.4 Decision

Decision API 必须可替换，不把 Utility AI 写死成产品唯一方案。

Tactical Wizard 首版推荐：

```text
Utility scoring
+
explicit behavior lifecycle
```

候选 Intent：

```text
Patrol
Investigate
Search
Engage
Reload
```

Host action：

```text
MoveTo
AimAt
Fire
Reload
```

暂不实现：

- TakeCover；
- Flank；
- Suppression；
- Retreat；
- Grenade planning；
- Director；
- LLM planner。

## 7. 确定性要求

Willform 的首版 runtime 必须从第一天保证：

```text
same config
+ same initial state
+ same context/stimulus stream
+ same seed
=
same decision stream
```

Core 不得直接使用：

```text
Math.random()
Date.now()
```

决定业务结果。

必须通过注入或显式 `TickContext` 提供：

- logical tick；
- delta time；
- deterministic seed/random source；
- stable event sequence。

测试必须证明：

- 输入数组迭代顺序不会无意改变结果；
- 同 seed 的 Memory decay / candidate scoring / intent selection 一致；
- reset 后不残留旧 Agent state。

## 8. Scheduler / Resource 本轮收缩

Willform 的长期产品仍然需要：

```text
Scheduler
Request
Resource
Ownership
Acquire / Release / Cancellation
```

但本任务只允许建立未来兼容的接口边界，不实现大而全资源调度器。

第一 Slice 只需要：

- 当前 Intent 可取消；
- Action lifecycle 有明确状态；
- 新高优先级 Intent 能替换旧 Intent；
- Trace 能记录 selected / rejected / cancelled reason。

等 Tactical Wizard 出现真实的武器控制、移动、施法、掩体等资源竞争后，再建立正式 Scheduler/Ownership 任务。

## 9. Schema

`Packages/Schema` 首版至少需要版本化：

- Willform project/config version；
- Agent definition；
- Context/Stimulus type references；
- Decision policy reference/config；
- Intent / Behavior reference；
- Memory decay parameters；
- host/engine extension namespace；
- reference Tactical Wizard generic rifle agent fixture。

要求：

- Schema 与 runtime model 有自动一致性验证；
- 未知字段/版本策略明确；
- 不保存 TWR 绝对磁盘路径；
- 不把 TWR weapon JSON 复制进 Willform agent definition；
- Agent 只引用 host capability/behavior identity。

## 10. Protocol

`Packages/Protocol` 首版只实现 Workbench 真正需要的消息：

```text
handshake
capability negotiation
project / instance identity
agent inventory
agent runtime snapshot
observation / memory snapshot
decision candidates / selected intent
action state
trace event / timeline batch
validation result
```

要求：

- envelope 有协议版本；
- transport neutral；
- WebSocket 只是首个 adapter 候选，不进入消息语义；
- snapshot 与 trace 明确区分；
- telemetry 可以禁用；
- development command 先做最小接口或延期，不为了“远程控制”扩大权限。

## 11. Web Bridge

`Bridges/Web` 是第一个 Reference Bridge，但必须是通用 Web Host Bridge，不是 Tactical Wizard 专用目录。

至少负责：

- host object/stable id ↔ Agent id；
- Context/Stimulus provider adapter；
- Behavior/Action executor adapter；
- local config load；
- telemetry producer；
- Protocol transport endpoint adapter；
- dispose/reset。

TWR-specific 字段必须在 Host 侧被转换为通用 Willform 数据。

如果需要示例，使用：

```text
Examples/TacticalWizard/
```

其中只能放：

- README；
- portable fixture；
- trace fixture；
- adapter contract example；

不得复制 TWR 源码或资产。

## 12. Tactical Wizard Agent Slice 01

第一 Reference Agent 只做**普通持枪人类敌人**。

必须可表达：

```text
Patrol
 ↓
Hear / Visual stimulus
 ↓
Investigate
 ↓
Visual confirm
 ↓
Engage
 ↓
Aim / Fire
 ↓
Lose sight
 ↓
Search last-known information
 ↓
Memory decay
 ↓
Return Patrol
```

### 第一阶段不要求完整 Squad

现有 TWR `SquadAiCoordinator` 继续作为 Golden Reference。Willform 首任务只需：

- 给 `squad_report / ally_report` 留可版本化信息输入；
- 不建立共享真实世界黑板；
- 不让收到报告的 Agent 获得 Host 当前真实玩家坐标；
- 完整 Squad coordination 建立下一任务。

这样可以避免本任务同时实现 Core + Workbench + Protocol + Web Bridge + Squad Director 而失控。

## 13. Decision Trace 是首版核心交付

每次决策至少可以记录：

```text
agent id
tick
relevant observations
memory changes
candidate id / score
rejection reason
selected intent
previous intent cancellation reason
action request
action result
```

目标不是只回答“AI 在做什么”，而是能回答：

> 为什么选择它？为什么没有选择另一个？为什么中断？

Trace 必须是 portable/runtime 数据，不由 Workbench 临时反推。

## 14. Workbench / GitHub Pages 第一版

### 14.1 首页就是工具

访问 GitHub Pages 根地址后，首先看到 Willform Workbench Shell，例如：

```text
Willform Workbench
├─ Open portable config
├─ Open bundled Tactical Wizard demo
├─ Connect runtime
├─ Recent/local browser projects（若实现）
├─ About / version / docs
└─ Agent / Runtime workspace
```

不需要额外创建一套纯营销主页。

### 14.2 第一版界面

至少实现：

```text
Project
├─ config viewer/editor
├─ schema validation
└─ connection status

Runtime
├─ Agent list
├─ Context / Observation
├─ Memory / Belief
├─ Decision Candidates
├─ Selected Intent
├─ Current Action
└─ Timeline / Trace
```

暂不做：

- 大型 Behavior Graph Editor；
- 通用节点编程 IDE；
- Resource graph 高级可视化；
- 多人协作后端；
- 登录系统。

### 14.3 Offline Demo

Pages 构建必须自带一个 Tactical Wizard generic rifle agent fixture，使任何人不运行游戏也可以：

1. 打开示例；
2. 查看 Agent config；
3. 回放固定 stimulus stream；
4. 查看 Decision Trace；
5. 看到 Patrol → Investigate → Engage → Search → Patrol。

这同时是产品 Demo 和自动回归样例。

### 14.4 静态托管兼容

Workbench 必须：

- 正确处理 GitHub Pages repository base path；
- 直接刷新不会因为 SPA history fallback 返回 404；
- 优先使用 Hash Router、单页状态或其它明确静态兼容方案；
- 不硬编码 localhost API；
- 没有 Bridge 时仍能运行；
- 不要求服务端渲染；
- 所有静态资源使用可配置 base URL。

## 15. GitHub Pages 发布流水线

建立独立 GitHub Actions workflow，例如：

```text
.github/workflows/pages.yml
```

要求：

1. 在主分支通过验证后构建 Workbench；
2. 只部署 `Apps/Workbench` 的 production artifact；
3. Pages artifact 与本地正式 build 使用同一构建命令；
4. 不提交构建产物到 `main` 作为人工维护文件；
5. workflow 使用 GitHub 官方 Pages artifact/deploy 能力或当时已批准方案；
6. build 失败时不得部署旧的“成功假象”；
7. 记录版本/commit SHA，Workbench About 中可看到当前构建身份；
8. 不在 workflow 中写入任何用户密钥或私有服务凭据。

如果仓库 Pages 尚未在 GitHub 设置中启用，代码和 workflow 完成后应明确报告需要用户执行的仓库设置，不声称已上线。

## 16. 建议目录

首版可以演化为：

```text
Apps/Workbench/
  src/
    app/
    project/
    connection/
    agent-inspector/
    trace/
    demo/
  index.html
  vite.config.*

Packages/Core/
  src/
    agent/
    context/
    perception/
    memory/
    decision/
    intent/
    action/
    trace/

Packages/Schema/
  src/
  schemas/
  fixtures/

Packages/Protocol/
  src/
    messages/
    transport/

Bridges/Web/
  src/

Examples/TacticalWizard/
  README.md
  generic-rifle-agent.*
  trace-fixture.*

Tests/
  core/
  schema/
  protocol/
  web-bridge/
  reference-slice/

.github/workflows/pages.yml
```

最终目录可按工具链调整，但不得改变顶层职责。

## 17. 分发与 TWR 接入

本任务需要至少产出一种**不污染 TWR 仓库的本地验证方式**，例如可复现 package build / pack artifact。

限制：

- 不要求 TWR 提交本机 `file:C:/...` 依赖；
- 不复制 Willform 源码进 TWR；
- 不把 GitHub Pages/CDN 当 shipping runtime；
- 不自动决定最终 npm registry / GitHub Packages / binary/WASM 分发策略；
- 正式长期分发方案作为后续 packaging ADR。

本任务的目标是证明合同与运行闭环，不是提前完成公开包发布体系。

## 18. 文档更新

实施时至少更新：

```text
Docs/ROADMAP.md
Docs/DECISIONS.md
Docs/WEB_WORKBENCH.md
Apps/Workbench/README.md
```

必要时同步：

```text
README.md
Docs/PRODUCT.md
Docs/ARCHITECTURE.md
CHANGELOG.md
```

必须记录两条架构决策：

1. Tactical Wizard / Web 成为 Reference Application/Host #1，Unreal 为第二跨引擎生产验证；
2. `Apps/Workbench` production build 本身就是 Willform GitHub Pages 发布站点，不建立功能重复的独立官网。

## 19. 验收标准

### Core

1. 最小 Agent runtime 可创建、tick、reset、dispose。
2. Context / Stimulus / Observation / Memory / Belief / Decision / Intent / Action / Trace 具有明确边界。
3. 同输入、同 seed 得到相同 decision stream。
4. 不依赖任何游戏引擎 SDK。
5. Utility policy 可以替换，不是 Core 唯一不可更改实现。

### Schema

6. Agent/config 有显式版本。
7. Tactical Wizard generic rifle agent fixture 通过验证。
8. 不包含 TWR 私有路径或宿主对象。

### Protocol

9. handshake、capability、agent inventory、snapshot、trace 可序列化/反序列化。
10. 协议语义不依赖 WebSocket。

### Web Bridge

11. 通用 Web Host 可以注册 Agent、提供 Context/Stimulus、执行 Action、输出 telemetry。
12. reset/disconnect 不破坏 Agent runtime。
13. 不包含 TWR 专用业务类型。

### Reference Slice

14. 固定 fixture 可稳定运行 Patrol → Investigate → Engage → Search → Patrol。
15. 失去视觉后只使用 Memory，不继续消费目标真实实时坐标。
16. Noise stimulus 能触发调查，但 Willform 不拥有 TWR 音频播放系统。
17. Aim/Fire/Reload 只产生 Host action，不自行实现 TWR 武器规则。

### Workbench / Pages

18. `Apps/Workbench` 本地 production build 可运行。
19. GitHub Pages 构建使用同一个 Workbench artifact。
20. Pages 根入口就是正式 Workbench，不存在第二套重复网页编辑器。
21. 无 Bridge 时可以打开 bundled demo、编辑/查看 portable config、查看 Trace。
22. Agent Inspector 可以看到 Context、Observation、Memory、Decision、Intent、Action。
23. Trace Timeline 能解释 candidate score / rejection / selection / cancellation。
24. repository base path 和刷新策略在 Pages 静态托管下正确。
25. Live transport 不可用时显示准确原因，不让 Offline Mode 失败。

### Runtime Independence

26. 关闭 Workbench 后 reference runtime 仍可继续执行。
27. Telemetry 关闭后不改变 decision result。
28. Pages 不成为 shipping runtime 网络依赖。

## 20. 不在本任务做

- Unreal Bridge 完整实现；
- Unity / Godot Bridge；
- StateTree adapter；
- 完整 Scheduler / Resource / Ownership；
- 完整 Squad coordination；
- Cover / Flank / Suppression；
- LLM / planner；
- 云端账户和项目存储；
- 远程多人协作；
- 自建后端服务；
- npm/GitHub Packages 正式公开发布策略；
- TWR 武器、体素、音频、掩体规则实现。

## 21. 开始前必须读取

```text
AGENTS.md
README.md
Docs/PRODUCT.md
Docs/ARCHITECTURE.md
Docs/ROADMAP.md
Docs/DECISIONS.md
Docs/WEB_WORKBENCH.md
Docs/REPOSITORY.md
Apps/Workbench/README.md
Packages/Core/README.md
Packages/Schema/README.md
Packages/Protocol/README.md
Bridges/Web/README.md
Bridges/Unreal/README.md
Tests/README.md
```

并重新核对 `Syurli/TWR_Dev` 中：

```text
Docs/ai/tasks/todo/TASK-UNCLAIMED-20260811-009_能动Willform首个游戏端参考接入_AIHost边界与Legacy基线.md
src/simulation/combat/EnemyAiController.ts
src/simulation/combat/SquadAiCoordinator.ts
src/simulation/perception/CombatNoise.ts
src/simulation/perception/CombatPerception.ts
```

TWR 只作为需求/Fixture 来源。不得通过复制其实现来缩短 Willform 开发。

## 22. 任务执行顺序

推荐按以下 Gate 执行：

### V-A：文档与工具链

- ADR：Reference Application #1；
- ADR：Pages = Workbench；
- 冻结首版 TypeScript workspace 技术栈；
- CI 基础。

### V-B：Portable Contracts

- Core；
- Schema；
- deterministic tests。

### V-C：Reference Runtime

- Utility policy；
- Memory decay；
- Action lifecycle；
- DecisionTrace；
- Tactical Wizard generic fixture。

### V-D：Protocol + Web Bridge

- handshake；
- inventory；
- snapshot；
- trace；
- generic Web Host adapter。

### V-E：Workbench

- project shell；
- bundled demo；
- Agent Inspector；
- Trace Timeline；
- connection manager；
- static build。

### V-F：Pages

- GitHub Actions deployment；
- base path；
- offline smoke test；
- Pages 设置检查。

### V-G：TWR 双仓联调

- 产出可消费的本地 build/pack；
- 与 TWR AI-HOST-2 进入用户批准的联调窗口；
- 不在 Willform 仓库直接修改 TWR 文件。

## 23. Definition of Done

完成时必须报告：

- 最终技术栈与 ADR；
- Core/Schema/Protocol 当前版本；
- Tactical Wizard fixture 如何验证真实需求；
- Workbench Pages 生产地址是否已由仓库设置真正启用；
- 若未启用，用户还需执行什么设置；
- Pages 与本地 Workbench 是否使用同一 artifact；
- Live connection 在 Pages / local 两种模式的实际能力与限制；
- deterministic test 结果；
- TWR 联调结果或明确阻塞；
- 哪些功能被故意留给下一任务（Squad、Scheduler、Cover tactical AI、Unreal）。