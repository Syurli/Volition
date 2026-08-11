# Workbench 小队掩体卡死与高分辨率移动修复

## 目标

修复 Tactical Wizard 内置示例中小队完成第一处掩体推进后可能因动态占位阻塞而停滞的问题，并提高 Simulation 中玩家与 AI 的位移分辨率。

## 验收

- A* 支持临时占位阻塞并能绕过其他小队成员。
- Bounding overwatch 至少连续完成多个 phase，而不是只验证第一次换位。
- 玩家方向键 / WASD 以子网格步长移动。
- AI 沿网格路径以连续子步长移动，认知/导航边界保持不变。
- LOS、掩体查询仍使用离散导航网格，避免高分辨率位移导致导航成本暴涨。
- CI、生产 Workbench build、reference package 全部通过。
