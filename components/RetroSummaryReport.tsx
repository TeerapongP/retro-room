"use client";

import { useEffect, useState } from "react";
import { subscribeToCards, type CardViewer } from "@/lib/firebase/cards";
import { subscribeToVotes } from "@/lib/firebase/votes";
import { subscribeToActionItems, subscribeToSessionSnapshots } from "@/lib/firebase/retro-summary";
import type { ActionItem, BoardCard, ColumnId, SessionSnapshot } from "@/lib/firebase/types";
import type { Voter } from "@/lib/votes";
import { CATEGORY_COLORS, CATEGORY_LABELS, calculateRetroAnalytics, type TrendPoint } from "@/lib/retro-analytics";
import { buildExcelXml } from "@/lib/retro-report";

type Props = { boardId: string; title: string; uid: string; isAdmin: boolean; embedded?: boolean };

function unavailable(text: string) {
  return <p className="retro-summary-unavailable" role="status">{text}</p>;
}

function CategoryChart({ rows }: { rows: ReturnType<typeof calculateRetroAnalytics>["categories"] }) {
  const countMax = Math.max(1, ...rows.map((row) => row.count));
  const max = Math.max(3, countMax <= 4 ? countMax : Math.ceil(countMax / 4) * 4);
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, tick) => tick) : [0, 1, 2, 3, 4].map((tick) => max * tick / 4);
  return <figure className="retro-summary-figure" aria-labelledby="category-title">
    <figcaption id="category-title">จำนวนการ์ดในแต่ละหมวดหมู่</figcaption>
    <svg className="retro-summary-svg" viewBox="0 0 620 250" role="img" aria-labelledby="category-title category-desc">
      <desc id="category-desc">{rows.map((row) => `${row.label} ${row.count} ใบ`).join(" รวมทั้งสามหมวดหมู่ ")}</desc>
      {ticks.map((tick) => { const y = 205 - 168 * tick / max; return <g key={tick}><line x1="175" x2="595" y1={y} y2={y} className="retro-summary-gridLine" /><text x="160" y={y + 5} textAnchor="end" className="retro-summary-axis">{tick}</text></g>; })}
      {rows.map((row, index) => { const barWidth = 380 * row.count / max; return <g key={row.id}><text x="10" y={67 + index * 65} className="retro-summary-label">{row.label}</text><rect x="175" y={45 + index * 65} width={Math.max(row.count ? 3 : 0, barWidth)} height="30" rx="5" fill={row.color} /><text x={Math.min(590, 183 + barWidth)} y={66 + index * 65} className="retro-summary-value">{row.count}</text></g>; })}
      <text x="385" y="245" textAnchor="middle" className="retro-summary-axis">จำนวนการ์ด</text>
    </svg>
    <ul className="retro-summary-legend">{rows.map((row) => <li key={row.id}><i style={{ backgroundColor: row.color }} />{row.label}</li>)}</ul>
    <p className="retro-summary-summary" aria-label="คำอธิบายกราฟหมวดหมู่">{rows.map((row) => `${row.label} ${row.count} ใบ`).join(" · ")}</p>
  </figure>;
}

function TopLikedChart({ rows }: { rows: ReturnType<typeof calculateRetroAnalytics>["topLiked"] }) {
  const max = Math.max(1, ...rows.map((row) => row.likes));
  return <figure className="retro-summary-figure" aria-labelledby="top-liked-title">
    <figcaption id="top-liked-title">สามการ์ดที่ได้รับไลก์สูงสุด</figcaption>
    {rows.length ? <ol className="retro-summary-ranking">{rows.map((row) => <li key={row.id}>
      <div className="retro-summary-rankText"><span className="retro-summary-rank">{rows.indexOf(row) + 1}</span><span className="retro-summary-cardText">{row.text}</span><span className="retro-summary-category" style={{ color: CATEGORY_COLORS[row.category] }}>{CATEGORY_LABELS[row.category]}</span><strong>{row.likes} ไลก์</strong></div>
      <div className="retro-summary-barTrack" aria-hidden="true"><span style={{ width: `${row.likes / max * 100}%`, backgroundColor: CATEGORY_COLORS[row.category] }} /></div>
    </li>)}</ol> : unavailable("ยังไม่มีการ์ดที่ได้รับไลก์")}
    <p className="retro-summary-summary">จำนวนไลก์นับคะแนนโหวตต่อการ์ด ไม่ใช่จำนวนผู้เข้าร่วมที่ไม่ซ้ำกัน</p>
    <ul className="retro-summary-legend">{Object.entries(CATEGORY_LABELS).map(([id, label]) => <li key={id}><i style={{ backgroundColor: CATEGORY_COLORS[id as ColumnId] }} />{label}</li>)}</ul>
  </figure>;
}

function LineChart({ points, mode }: { points: TrendPoint[] | null; mode: "categories" | "completion" }) {
  const ready = mode === "categories" ? points : points?.filter((point) => point.completionRate !== null) ?? null;
  const title = mode === "categories" ? "แนวโน้มจำนวนการ์ดในแต่ละเซสชัน" : "แนวโน้มอัตราปิดรายการที่ครบกำหนด";
  if (!ready || ready.length < 2) return <figure className="retro-summary-figure"><figcaption>{title}</figcaption>{unavailable(mode === "categories" ? "ต้องมีข้อมูลเซสชันที่เสร็จแล้วอย่างน้อย 2 ครั้งจึงจะแสดงแนวโน้ม" : "ต้องมีอย่างน้อย 2 เซสชันที่มีรายการครบกำหนดจึงจะแสดงแนวโน้ม")}</figure>;
  const dates = ready.map((point) => point.completedAt.toLocaleDateString("th-TH", { day: "numeric", month: "short" }));
  const x = (index: number) => 70 + index * 480 / (ready.length - 1);
  const y = (value: number, max: number) => 200 - value / max * 160;
  const series = mode === "categories" ? (Object.keys(CATEGORY_LABELS) as ColumnId[]).map((category) => ({ id: category, label: CATEGORY_LABELS[category], color: CATEGORY_COLORS[category], values: ready.map((point) => point.categories[category]) })) : [{ id: "completion", label: "อัตราปิดรายการที่ครบกำหนด", color: "#52784f", values: ready.map((point) => (point.completionRate ?? 0) * 100) }];
  const max = mode === "completion" ? 100 : Math.max(4, Math.ceil(Math.max(0, ...series.flatMap((item) => item.values)) / 4) * 4);
  return <figure className="retro-summary-figure" aria-labelledby={`${mode}-trend-title`}>
    <figcaption id={`${mode}-trend-title`}>{title}</figcaption>
    <svg className="retro-summary-svg" viewBox="0 0 620 265" role="img" aria-labelledby={`${mode}-trend-title ${mode}-trend-desc`}>
      <desc id={`${mode}-trend-desc`}>{ready.map((point, index) => `เซสชัน ${index + 1} ${dates[index]}`).join("; ")}. {series.map((line) => `${line.label}: ${line.values.join(", ")}`).join("; ")}</desc>
      {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="70" x2="550" y1={200 - tick * 40} y2={200 - tick * 40} className="retro-summary-gridLine" /><text x="58" y={205 - tick * 40} textAnchor="end" className="retro-summary-axis">{Math.round(max * tick / 4)}{mode === "completion" ? "%" : ""}</text></g>)}
      {dates.map((date, index) => <text key={`${date}-${index}`} x={x(index)} y="225" textAnchor="middle" className="retro-summary-axis">ครั้งที่ {index + 1}<title>เซสชันที่ {index + 1} · {date}</title></text>)}
      {series.map((line) => <g key={line.id}><polyline fill="none" stroke={line.color} strokeWidth="3" points={line.values.map((value, index) => `${x(index)},${y(value, max)}`).join(" ")} />{line.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value, max)} r="5" fill={line.color}><title>{line.label} {value}</title></circle>)}</g>)}
      <text x="310" y="258" textAnchor="middle" className="retro-summary-axis">วันที่จบเซสชัน</text>
    </svg>
    <ul className="retro-summary-legend">{series.map((line) => <li key={line.id}><i style={{ backgroundColor: line.color }} />{line.label}</li>)}</ul>
    <p className="retro-summary-summary">{mode === "completion" ? "คำนวณจากรายการที่สร้างแล้วและถึงวันครบกำหนด ณ เวลาจบแต่ละเซสชัน" : "จำนวนการ์ดเป็นปริมาณงานที่บันทึก ไม่ได้แสดงผลลัพธ์หรือคุณภาพของทีม"}</p>
  </figure>;
}

export function RetroSummaryReport({ boardId, title, uid, isAdmin, embedded = false }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const analytics = calculateRetroAnalytics(cards, voters, items, sessions, new Date());

  useEffect(() => {
    const onLoad = () => setLoaded((value) => value + 1);
    const onError = () => setError("โหลดข้อมูลสรุปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    const stops = [
      subscribeToCards(boardId, { uid, isAdmin }, (value) => { setCards(value); onLoad(); }, onError),
      subscribeToVotes(boardId, (value) => { setVoters(value); onLoad(); }, onError),
      subscribeToActionItems(boardId, (value) => { setItems(value); onLoad(); }, onError),
      subscribeToSessionSnapshots(boardId, (value) => { setSessions(value); onLoad(); }, onError),
    ];
    return () => stops.forEach((stop) => stop());
  }, [boardId, uid, isAdmin]);

  function downloadWorkbook() {
    const file = new Blob(["\ufeff", buildExcelXml(analytics)], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = `${boardId}-retro-summary.xls`; link.click(); URL.revokeObjectURL(url);
  }

  return <section className={`retro-summary-page${embedded ? " retro-summary-embedded" : ""}`} aria-label="สรุปย้อนหลัง">
    <header className="retro-summary-header"><div><p className="retro-summary-kicker">บันทึกการทบทวนของหมู่บ้าน</p>{embedded ? <h2>สรุปย้อนหลัง</h2> : <h1>สรุปย้อนหลังกระดาน</h1>}<p>{title}</p>{embedded ? null : <a className="retro-summary-returnLink" href={`/boards/${boardId}`}>กลับไปที่กระดาน</a>}</div><div className="retro-summary-toolbar"><button type="button" onClick={() => window.print()}>พิมพ์หรือบันทึก PDF</button><button type="button" onClick={downloadWorkbook}>ส่งออกไฟล์ Excel</button></div></header>
    {error ? <p role="alert" className="retro-summary-error">{error}</p> : null}
    {loaded < 4 ? <p role="status">กำลังโหลดข้อมูลสรุป…</p> : null}
    <section className="retro-summary-priority" aria-label="การ์ดเด่นจากทีม"><article className="retro-summary-paper"><h2>เสียงที่เด่นจากทีม</h2><TopLikedChart rows={analytics.topLiked} /></article></section>
    <section className="retro-summary-grid" aria-label="กราฟวิเคราะห์ย้อนหลัง"><article className="retro-summary-paper"><h2>ภาพรวมการ์ด</h2><CategoryChart rows={analytics.categories} /></article><article className="retro-summary-paper"><h2>แนวโน้มรายเซสชัน</h2><LineChart points={analytics.trends} mode="categories" /></article><article className="retro-summary-paper"><h2>การปิดรายการตามกำหนด</h2><LineChart points={analytics.trends} mode="completion" /></article></section>
    <p className="retro-summary-footer">ไลก์คือคะแนนโหวตที่บันทึกต่อการ์ด · จุดตัดคือเวลาจบเซสชัน และวันครบกำหนดแบบวันที่ใช้วันที่ UTC ของจุดตัด · ตัวหารคือรายการที่สร้างแล้วและครบกำหนดไม่เกินวันจุดตัด ส่วนตัวตั้งคือรายการเหล่านั้นที่เสร็จไม่เกินเวลาจบเซสชัน · ข้อมูลย้อนหลังเริ่มนับเมื่อมีการจบเซสชันหลังเพิ่มรายงานนี้</p>
  </section>;
}
