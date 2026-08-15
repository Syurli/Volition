# Willform Workbench

`Apps/Workbench` 是 **能动 Willform** 的正式浏览器编辑器，也是 GitHub Pages 部署站点本体。

## 当前编辑器能力

- Project Hub：内置示例、本地项目、导入/导出；
- Design：Agent 配置表单与 JSON 双视图；
- Simulation：Workbench 自带 2D Simulation Host；
- Debug：Context / Observation / Memory / Belief / Decision / Intent / Action / Trace；
- Visualization：Intent 时间线、Belief 历史、Decision score；
- Connection：通过 Willform Protocol 连接外部 Bridge；
- `中文 / English` UI 切换。

## Tactical Wizard Built-in Example

《战术巫师：裂隙突围》现在以三人普通步枪小队作为首个 Built-in Example。离线 Pages 可以直接验证：

```text
Formation Patrol
  ↓ hearing / visual confirmation
Individual Investigate + Shared Alert
  ↓
Squad roles: Suppressor / Mover / Observer
  ↓
Dynamic cover selection + unique occupancy
  ↓
Bounding overwatch / role swap
  ↓ target loss
Shared Last Known Position + individual Search / memory decay
  ↓
Formation Patrol
```

Simulation Host 提供 **48×30** 测试地图、静态障碍、deterministic grid A*、LOS、vision FOV、hearing、动态 cover-slot 查询、掩体占用、交替掩护，以及 2D debug drawing。

玩家测试体支持：

- 按住 `WASD` / 方向键持续移动；
- 移动产生低强度 footstep stimulus；
- `Space` 制造高强度测试噪声；
- 点击地图仍可用于快速传送测试位置。

## Host Boundary

地图、A*、LOS、动态掩体查询、占位与具体 movement/fire 表现属于 **Workbench Simulation Host**。Portable Core 仍负责 Agent 的 Observation → Memory/Belief → Decision → Intent 语义。

小队成员只能通过自身真实 Observation 或 `squad_report` 获取共享 Last Known Position。没有任何成员能看到玩家时，Simulation Host 不会把隐藏玩家的实时位置泄漏给认知层。

生产 Host 可以用 Unreal EQS/NavMesh、Unity/Godot 导航或自有系统替换 Workbench 的 cover/grid reference implementation，而不改变 Willform 的高层决策语义。

## Local Projects

第一阶段支持浏览器本机 Project Library、创建项目、Built-in Example 复制为本地项目，以及导入/导出 `willform.project.json`。浏览器本地存储只是工作副本；长期正式资产格式仍以普通本地文件为目标。

## Build

```bash
npm install
npm run test
npm run build
```
