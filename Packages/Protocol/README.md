# Volition Protocol

定义 Volition Workbench 与各 Bridge 的实时通信语义。

首批范围：handshake、capabilities、project/instance identity、Agent inventory、snapshot、telemetry、config sync、validation result。

Protocol 与 WebSocket/IPC 等具体 transport 解耦，并必须显式版本化。
