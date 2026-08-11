# Volition Workbench

`Apps/Workbench` 是 **能动 Volition** 的正式浏览器编辑器，也是 GitHub Pages 部署站点本体。

当前产品定位已经从单一 Runtime Inspector 升级为项目化 AI 工作台：

- Project Hub：内置示例、本地项目、导入/导出；
- Design：Agent 配置表单与 JSON 双视图；
- Simulation：Workbench 自带 2D Simulation Host；
- Debug：Context / Observation / Memory / Belief / Decision / Intent / Action / Trace；
- Visualization：Intent 时间线、Belief 历史、Decision score；
- Connection：通过 Volition Protocol 连接外部 Bridge；
- `中文 / English` UI 切换。

## Tactical Wizard Built-in Example

《战术巫师：裂隙突围》普通持枪敌人现在是 Workbench 的第一个 **Built-in Example Project**。离线 Pages 中可以直接运行 `Patrol → Investigate → Engage → Search → Patrol`。

Simulation Host 提供 24×16 测试地图、静态障碍、deterministic grid A*、LOS、vision FOV、hearing radius、Player 测试体，以及 Agent/path/LKP/vision/hearing/fire/search 的 2D debug drawing。

导航、地图、LOS、移动与表现属于 **Workbench Simulation Host**，不进入 Portable Core。

## Local Projects

第一阶段支持浏览器本机 Project Library、创建项目、Built-in Example 复制为本地项目，以及导入/导出 `volition.project.json`。浏览器本地存储只是工作副本；长期正式资产格式仍以普通本地文件为目标。

## Build

```bash
npm install
npm run test
npm run build
```
