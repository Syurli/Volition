# Workbench Projects & Simulation

Willform Workbench 是 AI 项目的设计、模拟、调试、可视化与连接入口。Runtime Inspector 是其中一个页面，不再等同于整个 Workbench。

```text
Workbench
├─ Projects
├─ Overview
├─ Design
├─ Simulation
├─ Debug
├─ Visualization
└─ Connection
```

## Project Model

Workbench 以 Project 为第一层用户对象。第一阶段可携带文件为 `willform.project.json`。Built-in Example 来源于应用 bundle，用户可以复制为 Local Project 后编辑和导出。Browser Project Library 是本机工作副本，不是云数据库。

## Tactical Wizard Built-in Example

第一个内置示例复用 `Examples/TacticalWizard` 的 portable Agent 定义与 Decision Policy，并由 Workbench Simulation Host 提供独立 2D 世界。示例链条为 `Patrol → Investigate → Engage → Search → Patrol`，由实际 Simulation world facts 产生 Stimulus；原 deterministic fixture 继续保留为 regression oracle。

## Simulation Host Boundary

2D test map、grid occupancy、A*、LOS/FOV、hearing、movement、fire/search visual effects 和 Player test controls 都属于 Workbench Simulation Host，不进入 Portable Core。Willform 选择 Intent，Host 负责世界执行并提供新的 Context / Stimulus。

## Target Information Privacy

目标可见时 Host 可以提供视觉位置；失去视觉后只发送 `visual_actor visible:false` 且不附带 position。Search 依赖 Memory / Belief 中的 Last Known Position，不得继续消费隐藏玩家实时坐标。

## Visualization

第一阶段包括 Intent timeline、Belief confidence history、Decision candidate scores 和 Stimulus / Trace history。
