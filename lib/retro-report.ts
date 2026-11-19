import { ACTION_STATUS_LABELS, CATEGORY_LABELS, type RetroAnalytics } from "./retro-analytics";

function xml(value: string | number): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function worksheet(name: string, rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const cells = rows.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xml(value)}</Data></Cell>`).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${xml(name)}"><Table>${cells}</Table></Worksheet>`;
}

export function buildExcelXml(analytics: RetroAnalytics): string {
  const historical = analytics.trends ?? [];
  const sheets = [
    worksheet("จำนวนการ์ด", [["หมวดหมู่", "จำนวนการ์ด"], ...analytics.categories.map((item) => [item.label, item.count])]),
    worksheet("สามการ์ดไลก์สูงสุด", [["อันดับ", "การ์ด", "หมวดหมู่", "จำนวนไลก์"], ...analytics.topLiked.map((item, index) => [index + 1, item.text, CATEGORY_LABELS[item.category], item.likes])]),
    worksheet("สถานะรายการ", [["สถานะ", "จำนวน", "รายการที่ครบกำหนด", "อัตราปิด (%)"], ...analytics.actionStatuses.map((item, index) => [ACTION_STATUS_LABELS[item.status], item.count, index === 0 ? analytics.dueActionCount : "", index === 0 ? analytics.currentCompletionRate === null ? "ไม่มีข้อมูล" : Math.round(analytics.currentCompletionRate * 100) : ""])]),
    worksheet("รายการที่ต้องทำ", [["รายการ", "สถานะ", "วันครบกำหนด", "วันที่สร้าง", "วันที่ทำเสร็จ"], ...analytics.actionItems.map((item) => [item.text, ACTION_STATUS_LABELS[item.status], item.dueDate, item.createdAt?.toISOString() ?? "ไม่มีข้อมูล", item.completedAt?.toISOString() ?? "ไม่มีข้อมูล"])]),
    worksheet("แนวโน้มย้อนหลัง", [["วันที่เซสชันจบ", CATEGORY_LABELS["went-well"], CATEGORY_LABELS["to-improve"], CATEGORY_LABELS.ideas, "อัตราปิดรายการที่ครบกำหนด (%)", "รายการที่ครบกำหนด"], ...historical.map((item) => [item.completedAt.toISOString(), item.categories["went-well"], item.categories["to-improve"], item.categories.ideas, item.completionRate === null ? "ไม่มีข้อมูล" : Math.round(item.completionRate * 100), item.dueActionCount])]),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets}</Workbook>`;
}
