# Willform Core

引擎无关的 Agent 产品语义与首个 portable reference runtime。

Reference Slice 01 只实现：Agent lifecycle、TickContext、Context、Stimulus → Observation、Memory/Belief、DecisionCandidate/DecisionResult、Intent、Action/ActionResult、DecisionTrace。

`DecisionPolicy` 是可替换接口；`UtilityDecisionPolicy` 只是首个参考策略工具，不把 Willform 永久定义为 Utility AI。

Core 不依赖 React、WebSocket、Tactical Wizard、Babylon.js、Jolt、Vlox 或任何游戏引擎 SDK。TypeScript 是首个 reference implementation，不是跨引擎产品语义。
