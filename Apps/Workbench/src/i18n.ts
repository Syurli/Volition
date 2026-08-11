export type Locale = 'zh-CN' | 'en-US';

const messages = {
  'zh-CN': {
    product: '能动 Volition', workbench: 'Workbench', projectHub: '项目', overview: '概览', design: '设计', simulation: '模拟', debug: '调试', visualization: '可视化', connection: '连接', settings: '设置', builtInExample: '内置示例', localProject: '本地项目', createProject: '新建项目', importProject: '导入项目', exportProject: '导出项目', duplicateProject: '复制为本地项目', resetExample: '重置示例', agentEditor: 'Agent 编辑器', formEditor: '表单编辑', jsonEditor: 'JSON', memory: '记忆', decision: '决策', behavior: '行为', capabilities: '能力', perception: '感知', play: '运行', pause: '暂停', step: '单步', reset: '重置', emitNoise: '制造噪声', movePlayer: '移动玩家', overlays: '调试图层', vision: '视野', hearing: '听觉', path: '路径', memoryOverlay: '记忆点', grid: '网格', cover: '掩体', currentIntent: '当前 Intent', beliefConfidence: 'Belief 置信度', runtimeInspector: '运行时检查器', intentTimeline: 'Intent 时间线', decisionScores: '决策评分', beliefHistory: 'Belief 历史', recentEvents: '最近事件', projectLibrary: '项目库', squadTactics: '小队战术', alertState: '共享警戒', boundingPhase: '交替掩护阶段', sharedLastKnown: '共享最后已知位置', directControl: '按住 WASD / 方向键直接控制玩家',
    exampleDescription: '官方内置战术巫师步枪小队示例：编队巡逻、听觉调查、共享警报、掩体求位、交替掩护、接敌与失联搜索。',
    localDescription: '项目数据保存在本机浏览器，并可导入/导出为 Volition 项目 JSON。',
    simulationDescription: 'Workbench Simulation Host 使用网格 A*、LOS、动态掩体槽位与基础 2D 表现执行 Host 侧导航和小队战术。',
    privacyDescription: '目标不可见后，Volition 只消费成员真实观测或小队共享的 Last Known Position；不会读取隐藏玩家的实时坐标。',
  },
  'en-US': {
    product: '能动 Volition', workbench: 'Workbench', projectHub: 'Projects', overview: 'Overview', design: 'Design', simulation: 'Simulation', debug: 'Debug', visualization: 'Visualization', connection: 'Connection', settings: 'Settings', builtInExample: 'Built-in example', localProject: 'Local project', createProject: 'New project', importProject: 'Import project', exportProject: 'Export project', duplicateProject: 'Duplicate as local project', resetExample: 'Reset example', agentEditor: 'Agent editor', formEditor: 'Form editor', jsonEditor: 'JSON', memory: 'Memory', decision: 'Decision', behavior: 'Behavior', capabilities: 'Capabilities', perception: 'Perception', play: 'Play', pause: 'Pause', step: 'Step', reset: 'Reset', emitNoise: 'Emit noise', movePlayer: 'Move player', overlays: 'Debug overlays', vision: 'Vision', hearing: 'Hearing', path: 'Path', memoryOverlay: 'Memory point', grid: 'Grid', cover: 'Cover', currentIntent: 'Current intent', beliefConfidence: 'Belief confidence', runtimeInspector: 'Runtime inspector', intentTimeline: 'Intent timeline', decisionScores: 'Decision scores', beliefHistory: 'Belief history', recentEvents: 'Recent events', projectLibrary: 'Project library', squadTactics: 'Squad tactics', alertState: 'Shared alert', boundingPhase: 'Bounding phase', sharedLastKnown: 'Shared last known', directControl: 'Hold WASD / arrow keys to directly control Player',
    exampleDescription: 'Bundled Tactical Wizard rifle-squad example: formation patrol, hearing investigation, shared alert, cover selection, bounding overwatch, engagement, target loss, and search.',
    localDescription: 'Project data stays on this machine and can be imported/exported as Volition project JSON.',
    simulationDescription: 'The Workbench Simulation Host owns grid A*, LOS, dynamic cover slots, movement, and squad-tactics execution.',
    privacyDescription: 'After target loss, Volition consumes only real member observations or squad-shared Last Known Position; hidden live player coordinates are not exposed.',
  },
} as const;

export type MessageKey = keyof typeof messages['en-US'];
export type Translate = (key: MessageKey) => string;
export function createTranslator(locale: Locale): Translate { return (key) => messages[locale][key] ?? messages['en-US'][key] ?? key; }
export function detectLocale(): Locale { if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) return 'zh-CN'; return 'en-US'; }
