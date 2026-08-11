# Volition Product Definition

## Identity

**能动 Volition**  
**Agent Decision & Behavior Framework**  
**A BAIGE Project**

## Product Statement

Volition 面向游戏中的自主 Agent，提供从 Context、Observation、Memory/Belief 到 Decision、Intent、Behavior Execution 和可解释 Trace 的统一组织方式，并在真实需求出现后继续扩展资源竞争与调度。

产品本体不是某一个引擎插件。Volition 由 **Portable Core + Browser Workbench + Host Bridges** 共同组成。

## Reference Application #1

第一个真实 Reference Application 是 `Syurli/TWR_Dev` / 《战术巫师：裂隙突围》，首个 Reference Host 为 Web。它先验证 Core、Schema、Protocol、Web Bridge、Workbench 与 Trace；Unreal 作为第二生产验证 Host，证明设计可跨引擎/跨语言实现。

## Product Pillars

### Agency
Agent 根据可获得的 Context、Observation 与 Belief 形成行动，而不是持续消费 Host 的隐藏真实状态。

### Separation of Decision and Execution
“选择做什么”与“具体怎么执行”独立演进。Volition 产出 Intent / ActionIntent；Host 执行移动、射击、物理、导航等世界操作，并返回 ActionResult。

### Portable Authoring
使用引擎无关、版本化配置与协议。Host-specific 数据只能进入明确 extension namespace。

### Browser-first Tooling
**Volition Workbench 本身就是 GitHub Pages 发布应用。** 首页、品牌、About、文档入口都属于 Workbench Shell，不维护第二套功能重复官网。

### Thin Bridges
Bridge 处理 identity mapping、Context/Stimulus adapter、Behavior/Action executor、config loading 与 telemetry，不重新定义 Core。

### Debuggability
Decision Trace 从第一版就是核心运行数据，必须能回答候选项分数/拒绝理由、最终选择、Intent 切换与 ActionResult。

## Reference Slice 01

最小 Core 概念：

- Agent / TickContext / ContextSnapshot
- Stimulus / Observation
- MemoryRecord / Belief
- DecisionCandidate / DecisionResult
- Intent / BehaviorReference
- ActionIntent / ActionResult
- DecisionTrace

第一 Reference Agent 是普通持枪敌人：

```text
Patrol → hear/perceive → Investigate → see/confirm → Engage
       → lose target → Search last-known information
       → confidence decay → Patrol
```

首版 Decision Policy 使用 Utility Decision + explicit behavior state，但 Decision API 可替换，Volition 不被定义为 Utility AI 框架。

## Host Boundary

Host 拥有真实世界状态、actor position/facing、LOS、NoiseEvent、导航、物理、武器与战斗执行；Volition 只消费经过 Host 适配的事实，不直接读取 Babylon、Jolt、Vlox、Tactical Wizard、Unreal、Unity 或 Godot 类型。

不可见目标不能持续获得精确实时世界坐标。Raw Stimulus 必须先成为 Observation，才可进入 Memory / Belief。

## Workbench Modes

- **Offline / Pages**：bundled demo、config、validation、runtime snapshot、Trace Inspector 独立可用；
- **Live production**：HTTPS Pages 只尝试安全 transport（首版 `wss://`）；
- **Local development**：可使用 `ws://localhost` / LAN 调试 endpoint，并在 UI 明确与 production mode 区分。

Workbench 不成为 shipping runtime 强依赖，telemetry 关闭不能改变决策结果。

## Deliberately Deferred

第一纵向切片不实现：Scheduler / Request / Resource / Ownership、完整 Squad、Cover/Flank/Suppression、GOAP、HTN、Behavior Tree 编辑器、LLM planner、Director、Mass/ECS、网络复制、云账户或后端项目存储。

## Relationship to UDMBF 1.0

UDMBF 1.0 与 Volition 是两个独立产品阶段。旧项目中经过验证的经验可以被重新评估，但不默认迁移旧实现。
