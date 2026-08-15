export type Locale = 'zh-CN' | 'en-US';

const messages = {
  'zh-CN': {
    product: '能动 Willform', workbench: 'Workbench', projectHub: '项目', overview: '概览', design: '设计', simulation: '模拟', debug: '调试', log: '运行日志', visualization: '可视化', connection: '连接', settings: '设置', builtInExample: '内置示例', localProject: '本地项目', createProject: '新建项目', importProject: '导入项目', exportProject: '导出项目', duplicateProject: '复制为本地项目', resetExample: '重置示例', agentEditor: 'AI 代理编辑器', formEditor: '表单编辑', jsonEditor: 'JSON', memory: '记忆', decision: '决策', behavior: '行为', capabilities: '能力', perception: '感知', play: '运行', pause: '暂停', step: '单步', reset: '重置', emitNoise: '制造噪声', movePlayer: '移动玩家', overlays: '调试图层', vision: '视野', hearing: '听觉', path: '路径', memoryOverlay: '记忆点', grid: '网格', cover: '战术目标', currentIntent: '当前 Intent', beliefConfidence: 'Belief 置信度', runtimeInspector: '运行时检查器', intentTimeline: 'Intent 时间线', decisionScores: '决策评分', beliefHistory: 'Belief 历史', recentEvents: '最近事件', projectLibrary: '项目库', squadTactics: '小队战术', alertState: '共享警戒', boundingPhase: '交替掩护阶段', sharedLastKnown: '共享最后已知位置', directControl: '按住 WASD / 方向键直接控制玩家', tactic: '当前战术', tacticReason: '战术原因', stationaryTarget: '目标静止 Tick',
    exampleDescription: '官方内置战术巫师步枪小队示例：编队巡逻、感知共享、交替掩护、侧翼迂回、交叉火力、协同猛攻、失联分区搜索与重新编组。',
    localDescription: '项目数据保存在本机浏览器，并可导入/导出为 Willform 项目 JSON。',
    simulationDescription: 'Willform 决定高层认知与战术意图；Workbench Simulation Host 负责 A*、LOS、掩体/扇区位置查询、移动与表现。',
    privacyDescription: '目标不可见后，Willform 只消费成员真实观测或小队共享的 Last Known Position；分区搜索不会读取隐藏玩家的实时坐标。',
  },
  'en-US': {
    product: '能动 Willform', workbench: 'Workbench', projectHub: 'Projects', overview: 'Overview', design: 'Design', simulation: 'Simulation', debug: 'Debug', log: 'Run Log', visualization: 'Visualization', connection: 'Connection', settings: 'Settings', builtInExample: 'Built-in example', localProject: 'Local project', createProject: 'New project', importProject: 'Import project', exportProject: 'Export project', duplicateProject: 'Duplicate as local project', resetExample: 'Reset example', agentEditor: 'AI Agent editor', formEditor: 'Form editor', jsonEditor: 'JSON', memory: 'Memory', decision: 'Decision', behavior: 'Behavior', capabilities: 'Capabilities', perception: 'Perception', play: 'Play', pause: 'Pause', step: 'Step', reset: 'Reset', emitNoise: 'Emit noise', movePlayer: 'Move player', overlays: 'Debug overlays', vision: 'Vision', hearing: 'Hearing', path: 'Path', memoryOverlay: 'Memory point', grid: 'Grid', cover: 'Tactical targets', currentIntent: 'Current intent', beliefConfidence: 'Belief confidence', runtimeInspector: 'Runtime inspector', intentTimeline: 'Intent timeline', decisionScores: 'Decision scores', beliefHistory: 'Belief history', recentEvents: 'Recent events', projectLibrary: 'Project library', squadTactics: 'Squad tactics', alertState: 'Shared alert', boundingPhase: 'Bounding phase', sharedLastKnown: 'Shared last known', directControl: 'Hold WASD / arrow keys to directly control Player', tactic: 'Current tactic', tacticReason: 'Tactic reason', stationaryTarget: 'Stationary target ticks',
    exampleDescription: 'Bundled Tactical Wizard rifle-squad example: formation patrol, shared perception, bounding overwatch, flanking, crossfire, coordinated assault, lost-contact sector sweep, and regrouping.',
    localDescription: 'Project data stays on this machine and can be imported/exported as Willform project JSON.',
    simulationDescription: 'Willform owns high-level cognition and tactical intent; the Workbench Simulation Host owns A*, LOS, cover/sector position queries, movement, and presentation.',
    privacyDescription: 'After target loss, Willform consumes only real member observations or squad-shared Last Known Position; sector sweep never reads hidden live player coordinates.',
  },
} as const;

export type MessageKey = keyof typeof messages['en-US'];
export type Translate = (key: MessageKey) => string;
export function createTranslator(locale: Locale): Translate { return (key) => messages[locale][key] ?? messages['en-US'][key] ?? key; }
export function detectLocale(): Locale { if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) return 'zh-CN'; return 'en-US'; }
