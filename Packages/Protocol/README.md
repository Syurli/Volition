# Volition Protocol

Protocol 0.1 定义 Workbench 真正需要的 transport-neutral 消息语义：handshake、capability negotiation、agent inventory、runtime snapshot、trace batch、validation result。

Envelope 显式携带 `protocolVersion` 与稳定 `sequence`。WebSocket 只是 Web/Workbench 的首个 transport adapter，不进入协议消息语义。

Snapshot 表示当前状态；Trace batch 表示历史解释事件，两者不混用。Telemetry 可以禁用而不改变 Agent decision result。
