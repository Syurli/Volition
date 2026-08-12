# 战术巫师战术升级与设计资产编辑器

Status: in-progress

## Goal

- 消除玩家静止时小队在固定掩体间无限交替射击的战术循环；
- 引入 Bounding / Flank / Assault / Regroup 战术升级与三人角色轮换；
- 调试代理颜色绑定 Agent identity，不随 tactical role 改变；
- 将 Workbench Design 从 `agents[0]` 参数表升级为 Squad / Agent / Behavior / Brain Supervisor / Reasoner 的强类型资产编辑器；
- 重新对齐 UDMBF 2.0 原规划中的 Supervisor / Reasoner / Arbitrator / Executor 边界。

## Validation

- stationary-target doctrine escalation regression;
- full three-member role rotation regression;
- typed Schema references validation;
- TypeScript typecheck;
- Vitest;
- production Workbench build;
- reference package output.
