import type { DecisionTrace } from '@volition/core';

export function Inspector({ title, value }: { readonly title: string; readonly value: unknown }) {
  return <article className="surface inspector"><h3>{title}</h3><pre>{JSON.stringify(value, null, 2)}</pre></article>;
}

export function Candidates({ trace }: { readonly trace: DecisionTrace }) {
  return <article className="surface inspector"><h3>Decision Candidates</h3><div className="candidate-list">{trace.candidates.map((candidate) => <div key={candidate.id} className={candidate.intent.id === trace.selectedIntent.id ? 'selected' : ''}><div><strong>{candidate.intent.id}</strong><span>{candidate.score.toFixed(2)}</span></div><small>{candidate.eligible ? candidate.reason : candidate.rejectedReason ?? candidate.reason}</small></div>)}</div></article>;
}

export function Metric({ label, value, detail }: { readonly label: string; readonly value: string | number; readonly detail: string }) {
  return <div className="metric-card"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>;
}

export function MetricLine({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="metric-line"><span>{label}</span><strong>{value}</strong></div>;
}

export function EmptyState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return <section className="empty-state"><span>◇</span><h2>{title}</h2><p>{detail}</p></section>;
}
