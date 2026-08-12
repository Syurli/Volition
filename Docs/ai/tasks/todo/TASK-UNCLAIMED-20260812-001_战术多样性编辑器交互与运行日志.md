# TASK — 战术多样性、编辑器交互与运行日志

状态：Completed

## 目标

解决 Tactical Wizard 参考模拟中“战术状态名变化，但空间表现仍收敛为同一种贴近射击循环”的问题，并提升 Volition Workbench 的设计编辑和复盘能力。

## 已完成

- Doctrine 扩展为 Bounding / Flank / Crossfire / Assault / Sweep / Regroup。
- 新增 Host-owned sector query，使侧翼、交叉火力、猛攻、搜索和重组具有不同角度与距离构型。
- 失去视觉后由盲目 Assault 转为基于 Last Known Position 的 Sector Sweep。
- Agent 调试颜色继续绑定稳定身份，不随战术职责变化。
- Design 重构为三类模块：代理与编队 / 行为模块 / 认知与决策。
- Agent 与 Squad Behavior 明确分栏并限制拖拽作用域。
- 拖拽增加源抓取态、合法落点、悬停反馈与小队成员排序反馈。
- 中文界面本地化小队、AI 代理、行为、战术、Supervisor、Reasoner 名称；内部 ID 保持稳定。
- 新增 Run Log：玩家动作、小队战术、小兵感知/决策/移动/射击/搜索均进入结构化日志。
- Run Log 支持导出 `volition.run-log.v1` JSON 用于复盘。
- 新增空间多样性、日志与本地化回归测试。

## 验收重点

1. 玩家静止时，小队不应永久重复两人交替出掩体射击。
2. Crossfire 应出现明显分离的两个火力位置。
3. Assault 后应主动 Regroup，而不是继续围绕玩家近距离循环。
4. 丢失视觉后应进入 Sweep，不继续按隐藏实时坐标追击。
5. 中文 UI 中资产显示中文名，英文 UI 中显示英文名。
6. Design 拖拽具有明确交互反馈，非法 Agent/Squad Behavior 作用域不接受落点。
7. Run Log 可以导出并包含 player / squad / agent 三类关键行为记录。
