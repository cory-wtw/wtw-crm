import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FORM_990N_LIMIT, type ProfitAndLoss } from "./report";

const W = 612;
const H = 792;
const M = 54;
const INK = rgb(0.11, 0.1, 0.07);
const MUTED = rgb(0.42, 0.4, 0.36);
const GOLD = rgb(0.73, 0.52, 0.15);
const RULE = rgb(0.85, 0.83, 0.78);

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * One-page-ish year-end summary for the accountant: gross receipts up top
 * (the only number the 990-N asks for), then the P&L and functional split
 * that a 990-EZ would need. Uses the built-in Helvetica so there's nothing
 * to bundle.
 */
export async function pnlPdf(
  pnl: ProfitAndLoss,
  periodLabel: string,
  generatedOn: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`WTW financial summary — ${periodLabel}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = INK) =>
    page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 10, f: PDFFont = font, color = INK) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const rule = (color = RULE) =>
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.5, color });
  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const fit = (raw: string, max: number, f: PDFFont, size: number) => {
    // Standard fonts are WinAnsi-only; anything else (emoji, CJK) would throw.
    const s = raw.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, "?");
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
    return `${out}…`;
  };

  text("WORTH THEIR WEIGHT", M, 9, bold, GOLD);
  y -= 20;
  text("Financial summary", M, 20, bold);
  y -= 16;
  text(`${periodLabel}  ·  EIN 41-5275144  ·  Generated ${generatedOn}`, M, 9, font, MUTED);
  y -= 34;

  // Headline numbers.
  const boxes: [string, string][] = [
    ["Gross receipts", usd.format(pnl.grossReceipts)],
    ["Total revenue", usd.format(pnl.totalIncome)],
    ["Total expenses", usd.format(pnl.totalExpenses)],
    [pnl.net >= 0 ? "Surplus" : "Deficit", usd.format(pnl.net)],
  ];
  const bw = (W - 2 * M) / boxes.length;
  boxes.forEach(([label, value], i) => {
    const x = M + i * bw;
    page.drawText(label.toUpperCase(), { x, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(value, { x, y: y - 18, size: 14, font: bold, color: INK });
  });
  y -= 34;
  text(
    pnl.grossReceipts > FORM_990N_LIMIT
      ? `Gross receipts exceed ${usd.format(FORM_990N_LIMIT)}. The 990-N may still apply (first-year and multi-year "normally" tests); otherwise a 990-EZ is required.`
      : `Gross receipts are under the ${usd.format(FORM_990N_LIMIT)} 990-N threshold (the test uses the normal, multi-year amount).`,
    M, 8, font, MUTED,
  );
  y -= 32;

  // Columns for the tables.
  const colTotal = W - M;
  const colFund = colTotal - 80;
  const colMgmt = colFund - 72;
  const colProg = colMgmt - 72;
  const nameMax = colProg - 72 - M;

  // Revenue
  ensure(60);
  text("REVENUE", M, 8, bold, GOLD);
  right("TOTAL", colTotal, 8, bold, GOLD);
  rule();
  y -= 18;
  for (const l of pnl.income) {
    ensure(16);
    text(fit(l.name, nameMax + 216, font, 10), M);
    right(usd.format(l.total), colTotal);
    y -= 15;
  }
  if (pnl.income.length === 0) {
    text("No revenue recorded.", M, 10, font, MUTED);
    y -= 15;
  }
  rule(INK);
  y -= 16;
  text("Total revenue", M, 10, bold);
  right(usd.format(pnl.totalIncome), colTotal, 10, bold);
  y -= 34;

  // Expenses with functional split
  ensure(60);
  text("EXPENSES", M, 8, bold, GOLD);
  right("PROGRAM", colProg, 8, bold, GOLD);
  right("MGMT & GEN.", colMgmt, 8, bold, GOLD);
  right("FUNDRAISING", colFund, 8, bold, GOLD);
  right("TOTAL", colTotal, 8, bold, GOLD);
  rule();
  y -= 18;
  for (const l of pnl.expenses) {
    ensure(16);
    text(fit(l.name, nameMax, font, 10), M);
    right(usd.format(l.program), colProg, 9, font, MUTED);
    right(usd.format(l.mgmt), colMgmt, 9, font, MUTED);
    right(usd.format(l.fundraising), colFund, 9, font, MUTED);
    right(usd.format(l.total), colTotal);
    y -= 15;
  }
  if (pnl.expenses.length === 0) {
    text("No expenses recorded.", M, 10, font, MUTED);
    y -= 15;
  }
  rule(INK);
  y -= 16;
  text("Total expenses", M, 10, bold);
  right(usd.format(pnl.functional.program), colProg, 9, bold);
  right(usd.format(pnl.functional.mgmt), colMgmt, 9, bold);
  right(usd.format(pnl.functional.fundraising), colFund, 9, bold);
  right(usd.format(pnl.totalExpenses), colTotal, 10, bold);
  y -= 15;
  text("Share of expenses", M, 9, font, MUTED);
  right(`${pnl.functional.programPct}%`, colProg, 9, font, MUTED);
  right(`${pnl.functional.mgmtPct}%`, colMgmt, 9, font, MUTED);
  right(`${pnl.functional.fundraisingPct}%`, colFund, 9, font, MUTED);
  y -= 34;

  ensure(30);
  text("Revenue less expenses", M, 12, bold);
  right(usd.format(pnl.net), colTotal, 12, bold);
  y -= 30;

  ensure(30);
  text(
    "Cash-basis records maintained in the WTW Roster. Functional allocation uses per-category defaults unless overridden on a transaction.",
    M, 7.5, font, MUTED,
  );

  return doc.save();
}
