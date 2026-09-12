"""PDF generator for the 24-hour energy dispatch report.

Receives a fully-computed ReportData object (built by the route from live
optimizer output) and returns a bytes object containing the PDF.

All values come from the MILP optimizer + baselines — nothing is hardcoded.
"""

import io
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.report.models import ReportData

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

# ── Colour palette (matches the Tailwind indigo/slate theme) ──────────────────
INDIGO = colors.HexColor("#4f46e5")
INDIGO_LIGHT = colors.HexColor("#e0e7ff")
EMERALD = colors.HexColor("#059669")
EMERALD_LIGHT = colors.HexColor("#d1fae5")
AMBER = colors.HexColor("#d97706")
AMBER_LIGHT = colors.HexColor("#fef3c7")
RED = colors.HexColor("#dc2626")
RED_LIGHT = colors.HexColor("#fee2e2")
SLATE_900 = colors.HexColor("#0f172a")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748b")
SLATE_200 = colors.HexColor("#e2e8f0")
SLATE_50 = colors.HexColor("#f8fafc")
WHITE = colors.white

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 1.5 * cm


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            fontSize=18,
            fontName="Helvetica-Bold",
            textColor=SLATE_900,
            leading=22,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            fontSize=9,
            fontName="Helvetica",
            textColor=SLATE_500,
            leading=13,
        ),
        "section": ParagraphStyle(
            "section",
            fontSize=11,
            fontName="Helvetica-Bold",
            textColor=INDIGO,
            leading=16,
            spaceBefore=6,
        ),
        "body": ParagraphStyle(
            "body",
            fontSize=8,
            fontName="Helvetica",
            textColor=SLATE_700,
            leading=12,
        ),
        "small": ParagraphStyle(
            "small",
            fontSize=7,
            fontName="Helvetica",
            textColor=SLATE_500,
            leading=10,
        ),
        "card_value": ParagraphStyle(
            "card_value",
            fontSize=16,
            fontName="Helvetica-Bold",
            textColor=SLATE_900,
            alignment=TA_CENTER,
            leading=20,
        ),
        "card_label": ParagraphStyle(
            "card_label",
            fontSize=7,
            fontName="Helvetica-Bold",
            textColor=SLATE_500,
            alignment=TA_CENTER,
            leading=10,
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer",
            fontSize=7,
            fontName="Helvetica",
            textColor=SLATE_500,
            leading=10,
        ),
        "insight": ParagraphStyle(
            "insight",
            fontSize=8,
            fontName="Helvetica",
            textColor=SLATE_700,
            leading=12,
            leftIndent=8,
        ),
        "right": ParagraphStyle(
            "right",
            fontSize=8,
            fontName="Helvetica",
            textColor=SLATE_500,
            alignment=TA_RIGHT,
            leading=12,
        ),
    }


def _fmt_inr(v: float) -> str:
    return f"Rs.{v:,.0f}"


def _fmt_kg(v: float) -> str:
    return f"{v:.1f} kg"


def _fmt_l(v: float) -> str:
    return f"{v:.1f} L"


def _fmt_pct(v: float) -> str:
    return f"{v:.1f}%"


def _savings_sign(v: float, positive_label: str, negative_label: str) -> str:
    if v >= 0:
        return f"+{positive_label}: {abs(v):,.1f}"
    return f"-{negative_label}: {abs(v):,.1f}"


def _header_table(data: ReportData, styles: dict, logo_path: str | None) -> Table:
    """Two-column header: logo+title on left, metadata on right."""
    left_items = []
    if logo_path and os.path.isfile(logo_path):
        try:
            left_items.append(Image(logo_path, width=2.2 * cm, height=2.2 * cm))
        except Exception:
            pass
    left_items.append(Paragraph("Microgrid Energy Mix Optimizer", styles["title"]))
    left_items.append(Paragraph("24-Hour Optimized Energy Dispatch Report", styles["subtitle"]))

    loc = data.location
    right_text = (
        f"<b>Generated:</b> {data.generated_at.strftime('%d/%m/%Y %H:%M')} IST<br/>"
        f"<b>Forecast date:</b> {data.forecast_date.strftime('%d/%m/%Y')}<br/>"
        f"<b>Location:</b> {loc['name']}, {loc['district']}, {loc['state']}<br/>"
        f"<b>Horizon:</b> 24 hours"
    )

    tbl = Table(
        [[left_items, Paragraph(right_text, styles["subtitle"])]],
        colWidths=[PAGE_W - 2 * MARGIN - 6 * cm, 6 * cm],
    )
    tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return tbl


def _impact_cards(data: ReportData, styles: dict) -> Table:
    """Five summary cards in a single row."""
    s = data.summary
    money_saved = s["optimized_cost"] - s["baseline_cost"]  # negative = saved
    cost_saved = s["baseline_cost"] - s["optimized_cost"]
    co2_reduced = s["baseline_co2"] - s["optimized_co2"]
    diesel_saved = s["baseline_diesel"] - s["optimized_diesel"]
    renewable_pct = s["renewable_utilization"]
    uptime = s["uptime"]

    def card(value_str: str, label: str, bg: object) -> list:
        return [
            Paragraph(value_str, styles["card_value"]),
            Paragraph(label, styles["card_label"]),
        ]

    cost_str = _fmt_inr(cost_saved) if cost_saved >= 0 else f"-{_fmt_inr(abs(cost_saved))}"
    co2_str = _fmt_kg(co2_reduced) if co2_reduced >= 0 else f"+{_fmt_kg(abs(co2_reduced))}"
    diesel_str = _fmt_l(diesel_saved) if diesel_saved >= 0 else f"+{_fmt_l(abs(diesel_saved))}"

    cards_data = [
        [
            card(cost_str, "MONEY SAVED TODAY", EMERALD_LIGHT),
            card(co2_str, "CO2 REDUCED", EMERALD_LIGHT),
            card(diesel_str, "DIESEL SAVED", AMBER_LIGHT),
            card(_fmt_pct(renewable_pct), "RENEWABLE UTILIZATION", INDIGO_LIGHT),
            card(_fmt_pct(uptime), "UPTIME", INDIGO_LIGHT),
        ]
    ]

    col_w = (PAGE_W - 2 * MARGIN) / 5
    tbl = Table(cards_data, colWidths=[col_w] * 5, rowHeights=[1.6 * cm])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (1, 0), EMERALD_LIGHT),
                ("BACKGROUND", (2, 0), (2, 0), AMBER_LIGHT),
                ("BACKGROUND", (3, 0), (4, 0), INDIGO_LIGHT),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROUNDEDCORNERS", [4]),
                ("BOX", (0, 0), (0, 0), 0.5, EMERALD),
                ("BOX", (1, 0), (1, 0), 0.5, EMERALD),
                ("BOX", (2, 0), (2, 0), 0.5, AMBER),
                ("BOX", (3, 0), (3, 0), 0.5, INDIGO),
                ("BOX", (4, 0), (4, 0), 0.5, INDIGO),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return tbl


def _comparison_table(data: ReportData, styles: dict) -> Table:
    s = data.summary
    cost_saved = s["baseline_cost"] - s["optimized_cost"]
    co2_reduced = s["baseline_co2"] - s["optimized_co2"]
    diesel_saved = s["baseline_diesel"] - s["optimized_diesel"]
    renewable_increase = s["renewable_utilization"] - s["baseline_renewable"]

    cost_pct = (cost_saved / s["baseline_cost"] * 100) if s["baseline_cost"] > 0 else 0.0
    co2_pct = (co2_reduced / s["baseline_co2"] * 100) if s["baseline_co2"] > 0 else 0.0

    def _p(text: str, align: str = "LEFT") -> Paragraph:
        st = ParagraphStyle(
            "td",
            fontSize=8,
            fontName="Helvetica",
            textColor=SLATE_700,
            alignment=TA_CENTER if align == "CENTER" else TA_LEFT,
            leading=11,
        )
        return Paragraph(text, st)

    def _ph(text: str) -> Paragraph:
        st = ParagraphStyle(
            "th",
            fontSize=8,
            fontName="Helvetica-Bold",
            textColor=WHITE,
            alignment=TA_CENTER,
            leading=11,
        )
        return Paragraph(text, st)

    def _savings_cell(val: float, unit: str, pct: float | None = None) -> Paragraph:
        color = EMERALD if val >= 0 else RED
        sign = "+" if val >= 0 else ""
        text = f"<font color='#{color.hexval()[2:]}'>{sign}{val:.1f} {unit}</font>"
        if pct is not None:
            text += f"<br/><font color='#{color.hexval()[2:]}'>{sign}{pct:.1f}%</font>"
        st = ParagraphStyle(
            "savings",
            fontSize=8,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
            leading=11,
        )
        return Paragraph(text, st)

    header = [_ph(""), _ph("BASELINE (Naive)"), _ph("OPTIMIZED"), _ph("SAVINGS")]
    rows = [
        header,
        [
            _p("Cost (Rs.)"),
            _p(f"Rs.{s['baseline_cost']:,.0f}", "CENTER"),
            _p(f"Rs.{s['optimized_cost']:,.0f}", "CENTER"),
            _savings_cell(cost_saved, "Rs.", cost_pct),
        ],
        [
            _p("CO2 (kg)"),
            _p(f"{s['baseline_co2']:.1f}", "CENTER"),
            _p(f"{s['optimized_co2']:.1f}", "CENTER"),
            _savings_cell(co2_reduced, "kg", co2_pct),
        ],
        [
            _p("Diesel (L)"),
            _p(f"{s['baseline_diesel']:.1f}", "CENTER"),
            _p(f"{s['optimized_diesel']:.1f}", "CENTER"),
            _savings_cell(diesel_saved, "L"),
        ],
        [
            _p("Renewable (%)"),
            _p(f"{s['baseline_renewable']:.1f}%", "CENTER"),
            _p(f"{s['renewable_utilization']:.1f}%", "CENTER"),
            _savings_cell(renewable_increase, "%"),
        ],
    ]

    col_w = (PAGE_W - 2 * MARGIN) / 4
    tbl = Table(rows, colWidths=[col_w] * 4)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
                ("BACKGROUND", (0, 1), (-1, 1), SLATE_50),
                ("BACKGROUND", (0, 3), (-1, 3), SLATE_50),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [SLATE_50, WHITE]),
                ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return tbl


def _hourly_table(data: ReportData, styles: dict) -> Table:
    def _ph(text: str) -> Paragraph:
        st = ParagraphStyle(
            "th",
            fontSize=6.5,
            fontName="Helvetica-Bold",
            textColor=WHITE,
            alignment=TA_CENTER,
            leading=9,
        )
        return Paragraph(text, st)

    def _p(text: str) -> Paragraph:
        st = ParagraphStyle(
            "td",
            fontSize=6.5,
            fontName="Helvetica",
            textColor=SLATE_700,
            alignment=TA_CENTER,
            leading=9,
        )
        return Paragraph(text, st)

    def _pa(text: str) -> Paragraph:
        st = ParagraphStyle(
            "action",
            fontSize=6,
            fontName="Helvetica",
            textColor=SLATE_700,
            alignment=TA_LEFT,
            leading=8,
        )
        return Paragraph(text, st)

    headers = [
        _ph("Hour"),
        _ph("Cloud\n%"),
        _ph("Wind\nm/s"),
        _ph("Solar\nAvail kW"),
        _ph("Wind\nAvail kW"),
        _ph("Demand\nkW"),
        _ph("Solar\nUsed kW"),
        _ph("Wind\nUsed kW"),
        _ph("Bat\nChg kW"),
        _ph("Bat\nDis kW"),
        _ph("Diesel\nkW"),
        _ph("SOC\n%"),
        _ph("Cost\nRs."),
        _ph("CO2\nkg"),
        _ph("Action"),
    ]

    col_widths = [
        1.2 * cm,  # Hour
        1.0 * cm,  # Cloud
        1.0 * cm,  # Wind speed
        1.3 * cm,  # Solar avail
        1.3 * cm,  # Wind avail
        1.3 * cm,  # Demand
        1.3 * cm,  # Solar used
        1.3 * cm,  # Wind used
        1.2 * cm,  # Bat chg
        1.2 * cm,  # Bat dis
        1.2 * cm,  # Diesel
        1.0 * cm,  # SOC
        1.3 * cm,  # Cost
        1.0 * cm,  # CO2
        None,      # Action — fills remaining width
    ]
    total_fixed = sum(w for w in col_widths if w is not None)
    action_w = PAGE_W - 2 * MARGIN - total_fixed
    col_widths[-1] = max(action_w, 3.0 * cm)

    rows = [headers]
    for h in data.hourly:
        ts = h["timestamp"]
        if isinstance(ts, str):
            from datetime import datetime as _dt
            ts = _dt.fromisoformat(ts)
        hour_label = ts.strftime("%H:%M")

        rows.append(
            [
                _p(hour_label),
                _p(f"{h['cloud_cover']:.0f}"),
                _p(f"{h['wind_speed']:.1f}"),
                _p(f"{h['solar_available_kw']:.1f}"),
                _p(f"{h['wind_available_kw']:.1f}"),
                _p(f"{h['demand_kw']:.1f}"),
                _p(f"{h['solar_used_kw']:.1f}"),
                _p(f"{h['wind_used_kw']:.1f}"),
                _p(f"{h['battery_charge_kw']:.1f}"),
                _p(f"{h['battery_discharge_kw']:.1f}"),
                _p(f"{h['diesel_kw']:.1f}"),
                _p(f"{h['soc_pct']:.0f}"),
                _p(f"{h['hourly_cost']:.0f}"),
                _p(f"{h['hourly_co2']:.2f}"),
                _pa(h["recommendation"]),
            ]
        )

    tbl = Table(rows, colWidths=col_widths, repeatRows=1)

    row_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
        ("GRID", (0, 0), (-1, -1), 0.3, SLATE_200),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]
    for i in range(1, len(rows)):
        bg = SLATE_50 if i % 2 == 0 else WHITE
        row_styles.append(("BACKGROUND", (0, i), (-1, i), bg))
        # Highlight diesel hours in amber
        if data.hourly[i - 1]["diesel_kw"] > 0.1:
            row_styles.append(("BACKGROUND", (10, i), (10, i), AMBER_LIGHT))

    tbl.setStyle(TableStyle(row_styles))
    return tbl


def _energy_mix_chart(data: ReportData, styles: dict) -> Table:
    """Simple ASCII-style bar chart rendered as a ReportLab table."""
    hours = data.hourly
    if not hours:
        return Table([[Paragraph("No data", styles["body"])]])

    max_demand = max((h["demand_kw"] for h in hours), default=1.0) or 1.0
    bar_max_w = PAGE_W - 2 * MARGIN - 2.5 * cm  # width available for bars
    bar_h = 0.28 * cm

    rows = []
    for h in hours:
        ts = h["timestamp"]
        if isinstance(ts, str):
            from datetime import datetime as _dt
            ts = _dt.fromisoformat(ts)
        label = ts.strftime("%H")

        solar_w = (h["solar_used_kw"] / max_demand) * bar_max_w
        wind_w = (h["wind_used_kw"] / max_demand) * bar_max_w
        bat_w = (h["battery_discharge_kw"] / max_demand) * bar_max_w
        diesel_w = (h["diesel_kw"] / max_demand) * bar_max_w

        bar_row = []
        if solar_w > 0.5:
            bar_row.append(("", solar_w, colors.HexColor("#f59e0b")))
        if wind_w > 0.5:
            bar_row.append(("", wind_w, colors.HexColor("#3b82f6")))
        if bat_w > 0.5:
            bar_row.append(("", bat_w, colors.HexColor("#8b5cf6")))
        if diesel_w > 0.5:
            bar_row.append(("", diesel_w, colors.HexColor("#ef4444")))

        # Build a mini table for the stacked bar
        if bar_row:
            bar_cells = [[Paragraph("", styles["small"])] * len(bar_row)]
            bar_tbl = Table(
                bar_cells,
                colWidths=[w for _, w, _ in bar_row],
                rowHeights=[bar_h],
            )
            bar_style = [("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]
            for idx, (_, _, col) in enumerate(bar_row):
                bar_style.append(("BACKGROUND", (idx, 0), (idx, 0), col))
            bar_tbl.setStyle(TableStyle(bar_style))
        else:
            bar_tbl = Paragraph("", styles["small"])

        lbl_style = ParagraphStyle(
            "lbl", fontSize=6, fontName="Helvetica", textColor=SLATE_500, alignment=TA_RIGHT
        )
        rows.append([Paragraph(label, lbl_style), bar_tbl])

    chart_tbl = Table(rows, colWidths=[1.2 * cm, bar_max_w])
    chart_tbl.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )

    # Legend
    legend_items = [
        ("Solar", colors.HexColor("#f59e0b")),
        ("Wind", colors.HexColor("#3b82f6")),
        ("Battery", colors.HexColor("#8b5cf6")),
        ("Diesel", colors.HexColor("#ef4444")),
    ]
    legend_cells = []
    for name, col in legend_items:
        swatch = Table([[""]], colWidths=[0.4 * cm], rowHeights=[0.25 * cm])
        swatch.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), col)]))
        legend_cells.extend([swatch, Paragraph(f" {name}", styles["small"])])

    legend_tbl = Table([legend_cells], colWidths=[0.5 * cm, 1.2 * cm] * 4)
    legend_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    wrapper = Table([[chart_tbl], [legend_tbl]], colWidths=[PAGE_W - 2 * MARGIN])
    wrapper.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return wrapper


def _insights_section(data: ReportData, styles: dict) -> list:
    items = []
    for i, insight in enumerate(data.insights, 1):
        items.append(Paragraph(f"{i}. {insight}", styles["insight"]))
        items.append(Spacer(1, 2 * mm))
    return items


def generate_pdf(data: ReportData, logo_path: str | None = None) -> bytes:
    """Build and return the PDF as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="Microgrid 24-Hour Energy Dispatch Report",
        author="PowerLoom",
    )

    styles = _styles()
    story = []

    # ── Page 1: Header + Impact cards + Comparison ────────────────────────────
    story.append(_header_table(data, styles, logo_path))
    story.append(HRFlowable(width="100%", thickness=1, color=SLATE_200, spaceAfter=6))

    story.append(Paragraph("TODAY'S OPTIMIZATION IMPACT", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_impact_cards(data, styles))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("BASELINE vs OPTIMIZED COMPARISON", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_comparison_table(data, styles))
    story.append(Spacer(1, 5 * mm))

    # ── Page 2: 24-hour dispatch table ────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("24-HOUR ENERGY DISPATCH PLAN", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_hourly_table(data, styles))

    # ── Page 3: Chart + Insights + Disclaimer ─────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("24-HOUR ENERGY MIX (stacked by source)", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    story.append(_energy_mix_chart(data, styles))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("OPTIMIZATION INSIGHTS", styles["section"]))
    story.append(Spacer(1, 3 * mm))
    story.extend(_insights_section(data, styles))
    story.append(Spacer(1, 5 * mm))

    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_200, spaceAfter=4))
    story.append(Paragraph("PLANNING & FORECAST DISCLAIMER", styles["section"]))
    story.append(Spacer(1, 2 * mm))
    disclaimer = (
        "This report is generated using the latest available weather forecast, estimated energy demand, "
        "system capacity, battery constraints, generator constraints, energy prices, and optimization "
        "assumptions available at the time of generation. Weather forecasts and energy demand may change, "
        "and actual renewable generation may differ from predicted values. The recommended dispatch plan "
        "is intended for planning and decision-support purposes and should be validated against real-time "
        "system conditions before operational use. "
        "Cost and CO2 values are estimates based on the configured energy prices, generation models, and "
        "emission factors (diesel CO2 factor: 2.68 kg CO2/L). Baseline comparison uses a naive load-following "
        "strategy (renewables first, then battery, then diesel) with no forecast look-ahead."
    )
    story.append(Paragraph(disclaimer, styles["disclaimer"]))

    doc.build(story)
    return buf.getvalue()
