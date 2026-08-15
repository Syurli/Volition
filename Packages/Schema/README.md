# Willform Schema

Schema 0.1 定义首个跨引擎 portable project/Agent 配置合同：显式版本、稳定 ID、Decision Policy reference、Memory decay、Context/Stimulus type references、Intent→Behavior reference、capabilities 与 extension namespace。

未知字段在 0.1 中产生 warning 并忽略；不支持的 `version` 产生 error。这样 Workbench 可以检查新版本文件，但不会把未知语义静默当成已支持。

Tactical Wizard fixture 只保存 generic rifle Agent 所需的 portable facts/reference，不保存 TWR 绝对路径、weapon JSON 或 Babylon/Jolt/Vlox 对象。
