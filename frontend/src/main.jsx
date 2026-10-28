import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Cloud, Download, Gauge, RefreshCw, ShieldCheck, Wind, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const fmt = (v, digits = 0) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateLabel = (v) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const shortTime = (v) => new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

function App() {
  const [start, setStart] = useState('2026-01-01');
  const [end, setEnd] = useState('2026-02-01');
  const [decisionHour, setDecisionHour] = useState('12');
  const [demo, setDemo] = useState(false);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState('all');

  async function loadData(useDemo = demo) {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ start, end, decision_hour: decisionHour, demo: String(useDemo) });
      const response = await fetch(`${API}/api/analysis?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Unable to load data');
      setPayload(body); setDemo(useDemo); setSelectedDay('all');
    } catch (e) { setError(`${e.message}. Make sure the Python API is running, or switch to Demo mode.`); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadData(false); }, []);

  const points = payload?.points || [];
  const dayOptions = useMemo(() => [...new Set(points.map(p => p.startTime.slice(0, 10)))], [points]);
  const filtered = useMemo(() => selectedDay === 'all' ? points : points.filter(p => p.startTime.slice(0, 10) === selectedDay), [points, selectedDay]);
  const chartData = useMemo(() => filtered.map(p => ({ ...p, label: dateLabel(p.startTime), time: shortTime(p.startTime), forecast: p.forecastGeneration, actual: p.actualGeneration, error: p.absoluteError })), [filtered]);
  const matched = points.filter(p => p.isMatched);
  const latestForecast = [...points].reverse().find(p => p.forecastGeneration != null);
  const lastUpdated = latestForecast?.publishTime ? dateLabel(latestForecast.publishTime) : 'No matched forecast';

  function exportCsv() {
    const headers = ['startTime','actualGeneration_MW','forecastGeneration_MW','publishTime','decisionCutoff','absoluteError_MW','signedError_MW'];
    const rows = points.map(p => [p.startTime,p.actualGeneration,p.forecastGeneration,p.publishTime,p.decisionCutoff,p.absoluteError,p.signedError]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'wind-forecast-analysis.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Wind size={22}/></div><div><div className="brand-name">NORTHSTAR</div><div className="brand-sub">ENERGY INTELLIGENCE</div></div></div>
      <div className="nav-label">WORKSPACE</div>
      <div className="nav-item active"><Activity size={17}/> Forecast accuracy <span className="nav-dot"/></div>
      <div className="nav-item"><Zap size={17}/> Procurement signals <span className="soon">PILOT</span></div>
      <div className="nav-item"><Gauge size={17}/> Model performance</div>
      <div className="sidebar-bottom"><div className="status-card"><span className="status-light"/><div><b>Data connection</b><small>{payload?.mode === 'live' ? 'Elexon API connected' : payload?.mode === 'demo' ? 'Demo dataset active' : 'Awaiting connection'}</small></div></div><div className="side-footer">UK POWER MARKETS <span>•</span> JAN 2026</div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">Analytics <span>/</span> Wind generation <span>/</span> <b>Forecast accuracy</b></div><div className="topbar-right"><span className="market-pill"><span/> GB NATIONAL</span><div className="avatar">NS</div></div></header>
      <div className="page-wrap">
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> DAY-AHEAD PROCUREMENT SUPPORT</div><h1>Wind forecast intelligence</h1><p>Understand expected renewable output, forecast reliability, and the uncertainty behind day-ahead power buying.</p></div><button className="secondary-btn" onClick={exportCsv} disabled={!points.length}><Download size={16}/> Export CSV</button></section>

        <section className="filters panel"><div className="filter-title"><CalendarDays size={17}/><span>Analysis window</span></div><div className="filter-fields"><label>DELIVERY FROM<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>DELIVERY TO <small>(exclusive)</small><input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label><label>DAY-AHEAD CUTOFF<select value={decisionHour} onChange={e=>setDecisionHour(e.target.value)}><option value="8">08:00 UK time</option><option value="10">10:00 UK time</option><option value="12">12:00 UK time</option><option value="16">16:00 UK time</option><option value="18">18:00 UK time</option><option value="23">23:00 UK time</option></select></label><button className="primary-btn" onClick={()=>loadData(demo)} disabled={loading}><RefreshCw size={15} className={loading?'spin':''}/>{loading?'Loading':'Run analysis'}</button><button className={`demo-btn ${demo?'on':''}`} onClick={()=>loadData(!demo)} disabled={loading}>{demo?'Exit demo':'Demo mode'}</button></div></section>

        {error && <div className="error-banner">{error}</div>}
        {payload?.note && <div className={`notice ${payload.mode==='demo'?'demo-notice':''}`}><ShieldCheck size={17}/><span>{payload.note} {payload.mode === 'demo' ? 'Switch Demo mode off to request live Elexon records.' : ''}</span></div>}

        <section className="metric-grid">
          <Metric title="Mean absolute error" value={payload?.metrics.maeMw == null ? '—' : fmt(payload.metrics.maeMw)} unit="MW" icon={<Activity size={18}/>} accent="blue" foot="Average absolute forecast miss" />
          <Metric title="Weighted absolute error" value={payload?.metrics.wapePercent == null ? '—' : fmt(payload.metrics.wapePercent,1)} unit="%" icon={<Gauge size={18}/>} accent="violet" foot="Absolute error ÷ actual generation" />
          <Metric title="Mean forecast bias" value={payload?.metrics.meanBiasMw == null ? '—' : `${payload.metrics.meanBiasMw > 0 ? '+' : ''}${fmt(payload.metrics.meanBiasMw)}`} unit="MW" icon={payload?.metrics.meanBiasMw > 0 ? <ArrowUpRight size={18}/> : <ArrowDownRight size={18}/>} accent="amber" foot="Positive = forecast overestimated wind" />
          <Metric title="Matched intervals" value={payload ? `${fmt(payload.metrics.matchedIntervals)} / ${fmt(payload.metrics.intervals)}` : '—'} unit="" icon={<CheckCircle2 size={18}/>} accent="green" foot={`${payload?.metrics.forecastCoveragePercent ?? 0}% forecast/actual coverage`} />
        </section>

        <section className="panel chart-panel"><div className="panel-heading"><div><div className="section-kicker">GENERATION OUTLOOK</div><h2>Forecast vs actual wind generation</h2><p>Half-hourly national generation · MW</p></div><div className="chart-controls"><label>VIEW DAY<select value={selectedDay} onChange={e=>setSelectedDay(e.target.value)}><option value="all">All days</option>{dayOptions.map(d=><option key={d} value={d}>{new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'})}</option>)}</select></label><div className="legend-key"><span className="legend-actual"/> Actual <span className="legend-forecast"/> Forecast</div></div></div>
          <div className="chart-area">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:8,left:0,bottom:0}}><defs><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c75f5" stopOpacity={0.22}/><stop offset="100%" stopColor="#7c75f5" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8edf4"/><XAxis dataKey={selectedDay==='all'?'startTime':'time'} tickFormatter={v=>selectedDay==='all'?new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}):v} minTickGap={35} tick={{fontSize:11,fill:'#8b95a7'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{fontSize:11,fill:'#8b95a7'}} axisLine={false} tickLine={false} width={42}/><Tooltip labelFormatter={v=>dateLabel(v)} formatter={(v,name)=>[v==null?'No data':`${fmt(v)} MW`,name==='actual'?'Actual generation':'Day-ahead forecast']} contentStyle={{border:'1px solid #e7ebf2',borderRadius:12,boxShadow:'0 8px 24px #14213d12'}}/><Area type="monotone" dataKey="forecast" name="Forecast" stroke="#7c75f5" strokeWidth={2} fill="url(#forecastFill)" connectNulls={false} dot={false}/><Line type="monotone" dataKey="actual" name="Actual" stroke="#14a68a" strokeWidth={2.3} dot={false} connectNulls={false}/></AreaChart></ResponsiveContainer> : <EmptyState loading={loading}/>}</div>
          <div className="chart-footer"><span><i className="dot green-dot"/> Actual generation · FUELHH</span><span><i className="dot purple-dot"/> Forecast available by cutoff · WINDFOR</span><span className="updated"><Clock3 size={13}/> Latest selected publish: {lastUpdated}</span></div>
        </section>

        <section className="lower-grid"><div className="panel error-panel"><div className="panel-heading compact"><div><div className="section-kicker">ERROR DISTRIBUTION</div><h2>Forecast miss by interval</h2><p>Absolute difference between forecast and actual</p></div></div><div className="error-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8edf4"/><XAxis dataKey={selectedDay==='all'?'startTime':'time'} tickFormatter={v=>selectedDay==='all'?new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}):v} minTickGap={35} tick={{fontSize:10,fill:'#8b95a7'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:'#8b95a7'}} axisLine={false} tickLine={false} width={38}/><Tooltip labelFormatter={v=>dateLabel(v)} formatter={v=>[v==null?'No data':`${fmt(v)} MW`,'Absolute error']}/><Line dataKey="error" name="Absolute error" stroke="#e9a23b" strokeWidth={1.8} dot={false} connectNulls={false}/></LineChart></ResponsiveContainer> : <EmptyState loading={loading}/>}</div></div>
          <div className="panel insight-panel"><div className="section-kicker">DECISION CONTEXT</div><h2>What the numbers mean</h2><div className="insight-row"><div className="insight-icon blue-bg"><Wind size={17}/></div><div><b>Forecast selection</b><p>For each delivery day, use the latest forecast published before the selected previous-day cutoff.</p></div></div><div className="insight-row"><div className="insight-icon purple-bg"><Activity size={17}/></div><div><b>MAE</b><p>Typical absolute miss in MW. Lower values indicate a closer forecast.</p></div></div><div className="insight-row"><div className="insight-icon amber-bg"><Gauge size={17}/></div><div><b>Bias</b><p>Positive bias means wind output was over-forecast on average; negative means under-forecast.</p></div></div><div className="method-note"><b>Method note</b><p>Cutoff time is an explicit pilot assumption, not a claim about the client's actual trading process. Validate it with the trading team.</p></div></div></section>

        <section className="panel table-panel"><div className="panel-heading"><div><div className="section-kicker">AUDITABLE INTERVAL DATA</div><h2>Forecast publication log</h2><p>Inspect selected forecast, cutoff and actual generation for each half-hour</p></div><span className="record-count">{filtered.length} intervals</span></div><div className="table-scroll"><table><thead><tr><th>DELIVERY TIME (UK)</th><th>FORECAST PUBLISHED</th><th>DAY-AHEAD FORECAST</th><th>ACTUAL GENERATION</th><th>ABS. ERROR</th><th>STATUS</th></tr></thead><tbody>{filtered.slice(0,100).map((p,i)=><tr key={p.startTime}><td className="time-cell">{dateLabel(p.startTime)}</td><td>{p.publishTime?dateLabel(p.publishTime):'—'}</td><td>{p.forecastGeneration==null?'—':`${fmt(p.forecastGeneration)} MW`}</td><td>{p.actualGeneration==null?'—':`${fmt(p.actualGeneration)} MW`}</td><td>{p.absoluteError==null?'—':`${fmt(p.absoluteError)} MW`}</td><td><span className={`table-status ${p.isMatched?'matched':'missing'}`}>{p.isMatched?'Matched':'Missing data'}</span></td></tr>)}</tbody></table>{filtered.length>100&&<div className="table-note">Showing first 100 intervals. Export CSV for the full selected period.</div>}{!filtered.length&&<EmptyState loading={loading}/>}</div></section>
        <footer className="footer"><span>© 2026 NORTHSTAR ENERGY INTELLIGENCE · PILOT</span><span>Data source: Elexon Insights Solution API · Wind generation only</span></footer>
      </div>
    </main>
  </div>;
}

function Metric({title,value,unit,icon,accent,foot}) { return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${accent}`}>{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-foot">{foot}</div></div> }
function EmptyState({loading}) { return <div className="empty-state"><Cloud size={28}/><b>{loading?'Loading generation data…':'No data to display'}</b><span>Choose a valid date range and run the analysis.</span></div> }

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
