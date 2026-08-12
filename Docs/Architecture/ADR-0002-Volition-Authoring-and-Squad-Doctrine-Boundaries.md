# ADR-0002：Volition Authoring Assets 与 Squad Doctrine 边界

Status: Accepted for current Alpha slice  
Date: 2026-08-12

## Context

Volition（原规划中的 UDMBF 2.0）当前 Workbench 已经能够独立模拟、调试和可视化 Tactical Wizard AI，但两个问题开始暴露：

1. Tactical Wizard 小队战术逐渐直接堆叠在 Workbench Simulation Host 中，容易让产品退化成单一游戏的脚本器；
2. Design 页面只编辑 `agents[0]` 的少量参数，无法表达原规划中的 Brain Supervisor、Reasoner、Action/Behavior Contract、Agent 与小队组合关系。

本 ADR 将当前 Alpha 的编辑资产与运行边界重新对齐到 Volition 的长期定位：**Agent Decision & Behavior Framework**，而不是 Unreal / StateTree / Tactical Wizard 专用工具。

## Decision

### 1. 保留原规划的四层职责

```text
Brain Supervisor
        ↓
Typed Reasoner
        ↓
Decision / Arbitrator
        ↓
Executor / Engine Bridge
```

- **Brain Supervisor**：只负责认知模式切换与接管关系；
- **Reasoner**：负责具体思考算法；Utility、Statechart、HTN、BT、GOAP 等保留各自内部语义；
- **Arbitrator / Decision**：负责候选与最终意图选择；
- **Executor / Bridge**：负责移动、导航、射击、动画、资源解析等 Host 行为。

Workbench 不建立一个 `GenericNode / GenericPort / GenericValue` 万能图来强制统一所有算法。

### 2. Schema 0.1 增加一等 Authoring Assets

项目源格式现在可声明：

- `AgentDefinition`
- `SquadDefinition`
- `BehaviorDefinition`
- `BrainSupervisorDefinition`
- `ReasonerDefinition`

Agent 仍保留 Runtime 使用的 `Intent -> host-neutral behavior reference` 映射；Authoring 层新增显式 asset id 引用，Schema validator 必须检查引用完整性。

### 3. Behavior 是契约，不是引擎实现

`BehaviorDefinition` 描述：

- stable id；
- scope（agent / squad）；
- Intent 语义；
- Host-neutral behavior alias；
- required capabilities；
- portable parameters。

Workbench 不把 Unreal 蓝图、UObject 路径、Unity ScriptableObject 或 Godot 节点路径写入 Portable Source。

### 4. Squad Doctrine 与 Host Geometry 分离

Tactical Wizard 示例将小队战术分为：

- **portable doctrine decision**：根据 contact duration、target stationary duration、tactic duration、bounding phase、visibility、stall 等事实决定 `bounding / flank / assault / regroup`；
- **Workbench Simulation Host resolution**：根据当前地图计算具体 cover slot、flank point、assault position、A* path、LOS 和移动表现。

因此生产 Bridge 可用 Unreal EQS/NavMesh、Unity/Godot Navigation 或自研系统替换位置求解，而无需重写高层 doctrine。

### 5. Design 使用专用资产编辑器，而非万能节点图

当前 Workbench Alpha 提供：

- Squad 编辑；
- Agent 编辑；
- Behavior Contract 编辑；
- Brain Supervisor 查看/编辑；
- Reasoner 类型与专用编辑边界；
- 拖拽 Agent 到 Squad；
- Squad Member 拖拽排序；
- 拖拽 Behavior 绑定到 Agent / Squad；
- JSON 与 Schema validation 作为底层视图。

后续 Utility、Statechart、HTN、Behavior Tree、GOAP 应分别获得专用编辑视图，共享的是生命周期、输入输出类型、诊断和 Trace，而不是算法内部图结构。

## Tactical Wizard reference doctrine

当前内置步枪小队不是最终游戏 AI，而是用于证明上述边界的 Reference Application：

```text
Contact
  ↓
Bounding Overwatch
  ↓ static pattern / repeated phases
Flank
  ↓ angle established / time budget
Coordinated Assault
  ↓ assault window exhausted
Regroup + Role Rotation
  ↓
Bounding / continued cognition
```

角色轮换覆盖三名成员，避免固定 Observer 永久不参与机动。Agent 的调试颜色属于 Agent identity，不随 tactical role 改变。

## Explicit gaps

本 ADR 不宣称以下能力已经完成：

- `.udai.json -> compiler -> .udbp` 独立编译器链；
- 完整 Statechart Runtime；
- HTN / BT / GOAP Runtime；
- Central Arbitrator 的完整资源竞争与 Action Scheduler；
- Unreal 正式 Bridge 的 Alpha 闭环。

这些仍按照长期规划依次建设。当前 Workbench 的 Schema validator 与 typed authoring assets 是进入 Compiler Alpha 前的源语义收敛步骤。

## Consequences

优点：

- Workbench 不再只围绕第一个 Agent；
- Tactical Wizard 示例可以继续扩展，而不污染 Portable Core 的地图/掩体语义；
- 未来新增 Boss、潜行、群体等示例时可以复用资产模型；
- 设计页面与原 UDMBF 2.0 的 Brain Supervisor / Reasoner / Action Contract 思路重新对齐。

代价：

- Schema 0.1 继续保持 Experimental；
- 新资产目前主要用于 Authoring 与 Reference Example，尚未全部编译进独立 VM；
- 后续必须尽快补齐 Compiler / diagnostics，否则编辑器能力会再次领先 Runtime 语义。
