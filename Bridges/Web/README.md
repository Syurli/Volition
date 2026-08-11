# Volition Web Bridge

第一个 Reference Bridge。它是通用 Web Host adapter，不是 Tactical Wizard 专用实现。

职责：stable Host id ↔ Agent runtime 注册、Context/Stimulus provider、Action executor、telemetry、Protocol transport endpoint、reset/dispose。

Bridge 不读取 Babylon.js、Jolt、Vlox 或 TWR 类型；TWR-specific 世界事实必须先在 TWR integration boundary 转换为通用 Volition 数据。
