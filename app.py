"""StockAI — Dash/Plotly frontend (replaces React)."""
import ssl
ssl._create_default_https_context = ssl._create_unverified_context  # breeze_connect fetches security master at import time

import sys
import os
import logging
import json as _json
from datetime import datetime

import dash
from dash import dcc, html, Input, Output, State, callback_context, no_update, ALL
import dash_bootstrap_components as dbc
import plotly.graph_objects as go

# ── Backend path ──────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from services.data_fetcher import get_live_quote, get_historical_data, POPULAR_STOCKS
from services.feature_engineering import add_indicators, latest_indicators
from services.predictor import generate_signal
from services.portfolio_service import get_portfolio

logging.basicConfig(level=logging.INFO)

# ── Design tokens (matching original React CSS variables) ─────────────────────
C = {
    "bg_base":     "#020617",
    "bg_surface":  "#0f172a",
    "bg_elevated": "#1e293b",
    "border":      "#334155",
    "text":        "#f1f5f9",
    "text_muted":  "#94a3b8",
    "primary":     "#6366f1",
    "buy":         "#10b981",
    "sell":        "#f43f5e",
    "hold":        "#f59e0b",
    "sma20":       "#f59e0b",
    "sma50":       "#60a5fa",
    "sma200":      "#a78bfa",
}


def _chart_layout(**overrides):
    layout = dict(
        paper_bgcolor=C["bg_elevated"],
        plot_bgcolor=C["bg_elevated"],
        font=dict(color=C["text"], size=11, family="Inter, JetBrains Mono, monospace"),
        margin=dict(l=60, r=12, t=28, b=30),
        xaxis=dict(
            gridcolor=C["border"], showgrid=True, gridwidth=1,
            color=C["text_muted"], rangeslider=dict(visible=False),
            showspikes=True, spikecolor=C["border"], spikethickness=1,
        ),
        yaxis=dict(
            gridcolor=C["border"], showgrid=True, gridwidth=1,
            color=C["text_muted"],
            showspikes=True, spikecolor=C["border"], spikethickness=1,
        ),
        hovermode="x unified",
        hoverlabel=dict(bgcolor=C["bg_surface"], font=dict(color=C["text"])),
        legend=dict(
            bgcolor="rgba(0,0,0,0)", font=dict(size=10),
            orientation="h", y=1.08, x=0,
        ),
    )
    layout.update(overrides)
    return layout


def _empty_fig(msg="Select a stock"):
    fig = go.Figure()
    fig.update_layout(**_chart_layout(
        annotations=[dict(
            text=msg, x=0.5, y=0.5, showarrow=False,
            font=dict(color=C["text_muted"], size=13),
            xref="paper", yref="paper",
        )]
    ))
    return fig


# ── App initialisation ────────────────────────────────────────────────────────
app = dash.Dash(
    __name__,
    external_stylesheets=[
        dbc.themes.CYBORG,
        dbc.icons.BOOTSTRAP,
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&"
        "family=JetBrains+Mono:wght@400;500&display=swap",
    ],
    title="StockAI",
    suppress_callback_exceptions=True,
    meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
)
server = app.server  # expose Flask server

STOCK_OPTIONS = [
    {"label": f"{s['name']}  ({s['stock_code']})", "value": s["stock_code"]}
    for s in POPULAR_STOCKS
]
DEFAULT_STOCK = POPULAR_STOCKS[0]["stock_code"]


# ── Layout helpers ────────────────────────────────────────────────────────────

def _header():
    return html.Header(className="app-header", children=[
        html.Div(className="logo", children=[
            html.Span("Stock", className="logo-text"),
            html.Span("AI",    className="logo-accent"),
        ]),
        dcc.Dropdown(
            id="stock-search", options=STOCK_OPTIONS, value=DEFAULT_STOCK,
            placeholder="Search stocks…", clearable=False,
            className="stock-dropdown",
        ),
        html.Div(id="clock", className="clock"),
        dcc.Interval(id="clock-interval", interval=1000),
        html.Div(className="nav-tabs", children=[
            html.Button("Analysis",  id="tab-analysis",  n_clicks=0, className="nav-tab active"),
            html.Button("Portfolio", id="tab-portfolio", n_clicks=0, className="nav-tab"),
        ]),
    ])


def _sidebar():
    return html.Aside(className="app-sidebar", children=[
        html.Div(className="sidebar-header", children=[
            html.Span("Watchlist", className="sidebar-title"),
            dcc.Interval(id="wl-interval", interval=30000),
        ]),
        html.Div(id="watchlist-items", className="watchlist-items"),
    ])


def _quote_bar():
    fields = [("Open","q-open"), ("High","q-high"), ("Low","q-low"),
              ("Prev Close","q-prev"), ("Volume","q-vol")]
    return html.Div(className="quote-bar", children=[
        html.Div(className="quote-left", children=[
            html.Span(id="q-symbol", className="q-symbol"),
            html.Span(id="q-price",  className="q-price"),
            html.Span(id="q-change", className="q-change"),
        ]),
        html.Div(className="quote-stats", children=[
            html.Div(className="q-item", children=[
                html.Span(lbl, className="q-item-label"),
                html.Span(id=uid, className="q-item-val"),
            ]) for lbl, uid in fields
        ]),
        html.Button(
            [html.I(className="bi bi-arrow-clockwise"), " Refresh"],
            id="quote-refresh", n_clicks=0, className="btn-icon",
        ),
    ])


def _charts():
    cfg = {"displayModeBar": False, "responsive": True}
    return html.Div(className="charts-section", children=[
        dcc.Loading(
            dcc.Graph(id="chart-main", config=cfg, style={"height": "400px"}),
            color=C["primary"], type="dot",
        ),
        dcc.Graph(id="chart-vol",  config=cfg, style={"height": "110px"}),
        dcc.Graph(id="chart-rsi",  config=cfg, style={"height": "140px"}),
        dcc.Graph(id="chart-macd", config=cfg, style={"height": "140px"}),
    ])


def _prediction_card():
    return html.Div(className="card prediction-card", children=[
        html.Div("AI Prediction", className="card-title"),
        html.Div(className="signal-row", children=[
            html.Div(id="signal-badge", className="signal-badge"),
            html.Div(className="conf-section", children=[
                html.Div("Confidence", className="conf-label"),
                html.Div(className="conf-bar-outer", children=[
                    html.Div(id="conf-fill", className="conf-fill"),
                    html.Span(id="conf-pct", className="conf-pct"),
                ]),
            ]),
        ]),
        html.Div(className="pred-prices", children=[
            html.Div([html.Div("Current",  className="pred-label"), html.Div(id="pred-cur",    className="pred-val")]),
            html.Div([html.Div("Forecast", className="pred-label"), html.Div(id="pred-fore",   className="pred-val buy")]),
            html.Div([html.Div("Target",   className="pred-label"), html.Div(id="pred-target", className="pred-val buy")]),
            html.Div([html.Div("Stop Loss",className="pred-label"), html.Div(id="pred-stop",   className="pred-val sell")]),
        ]),
        html.Div(id="pred-reasoning", className="pred-reasoning"),
        html.Button(
            [html.I(className="bi bi-cpu"), " Analyze"],
            id="analyze-btn", n_clicks=0, className="btn-analyze",
        ),
        dcc.Loading(html.Div(id="analyze-out"), color=C["primary"], type="dot"),
    ])


def _indicator_panel():
    rows = [
        ("RSI 14",     "ind-rsi"),
        ("MACD",       "ind-macd"),
        ("MACD Signal","ind-macd-sig"),
        ("SMA 20",     "ind-sma20"),
        ("SMA 50",     "ind-sma50"),
        ("SMA 200",    "ind-sma200"),
        ("BB Upper",   "ind-bb-up"),
        ("BB Lower",   "ind-bb-lo"),
        ("ATR",        "ind-atr"),
        ("Stoch K",    "ind-stoch"),
    ]
    return html.Div(className="card", children=[
        html.Div("Technical Indicators", className="card-title"),
        html.Div(className="ind-grid", children=[
            html.Div(className="ind-row", children=[
                html.Span(lbl, className="ind-label"),
                html.Span(id=uid, className="ind-val"),
            ]) for lbl, uid in rows
        ]),
    ])


def _analysis_page():
    return html.Div(id="analysis-page", className="page", children=[
        _quote_bar(),
        html.Div(className="analysis-grid", children=[
            _charts(),
            html.Div(className="right-col", children=[
                _prediction_card(),
                _indicator_panel(),
            ]),
        ]),
        dcc.Store(id="ind-store"),
    ])


def _portfolio_page():
    return html.Div(id="portfolio-page", className="page", style={"display": "none"}, children=[
        # Stats row
        html.Div(className="port-stats", children=[
            html.Div(className="stat-card", children=[html.Div("Cash Balance",   className="stat-label"), html.Div(id="p-cash",     className="stat-val")]),
            html.Div(className="stat-card", children=[html.Div("Invested Value", className="stat-label"), html.Div(id="p-invested", className="stat-val")]),
            html.Div(className="stat-card", children=[html.Div("Current Value",  className="stat-label"), html.Div(id="p-current",  className="stat-val")]),
            html.Div(className="stat-card", children=[html.Div("Total P&L",      className="stat-label"), html.Div(id="p-pnl",      className="stat-val")]),
            html.Button([html.I(className="bi bi-arrow-clockwise"), " Refresh"],
                        id="port-refresh", n_clicks=0, className="btn-icon"),
        ]),
        html.Div(className="port-grid", children=[
            html.Div(className="card", children=[
                html.Div("Open Positions", className="card-title"),
                html.Div(id="pos-table"),
            ]),
            html.Div(className="card trade-panel", children=[
                html.Div("Execute Trade", className="card-title"),
                html.Div(className="trade-tabs", children=[
                    html.Button("BUY",  id="t-buy-tab",  n_clicks=0, className="trade-tab t-buy active"),
                    html.Button("SELL", id="t-sell-tab", n_clicks=0, className="trade-tab t-sell"),
                ]),
                html.Div(className="form-group", children=[
                    html.Label("Stock", className="form-label"),
                    html.Div(id="t-stock-display", className="t-stock"),
                ]),
                html.Div(className="form-group", children=[
                    html.Label("Quantity", className="form-label"),
                    dcc.Input(id="t-qty", type="number", min=1, value=1,
                              placeholder="Qty", className="form-input"),
                ]),
                html.Div(className="ltp-row", children=[
                    html.Span("LTP: ", className="ltp-label"),
                    html.Span(id="t-ltp", className="ltp-val"),
                ]),
                html.Div(id="t-total", className="t-total"),
                html.Button("EXECUTE TRADE", id="trade-btn", n_clicks=0, className="btn-trade"),
                html.Div(id="trade-status", className="trade-status"),
                dcc.Store(id="trade-action", data="BUY"),
            ]),
        ]),
        html.Div(className="card", children=[
            html.Div("Recent Trades", className="card-title"),
            html.Div(id="trades-table"),
        ]),
        dcc.Interval(id="port-interval", interval=60000),
    ])


# ── Root layout ───────────────────────────────────────────────────────────────
app.layout = html.Div(className="app-root", children=[
    dcc.Store(id="sel-stock", data=DEFAULT_STOCK),
    _header(),
    html.Div(className="app-body", children=[
        _sidebar(),
        html.Main(className="app-main", children=[
            _analysis_page(),
            _portfolio_page(),
        ]),
    ]),
])


# ── Callbacks ─────────────────────────────────────────────────────────────────

@app.callback(Output("clock", "children"), Input("clock-interval", "n_intervals"))
def _clock(_):
    import pytz
    return datetime.now(pytz.timezone("Asia/Kolkata")).strftime("%H:%M:%S IST")


@app.callback(
    Output("analysis-page",  "style"),
    Output("portfolio-page", "style"),
    Output("tab-analysis",   "className"),
    Output("tab-portfolio",  "className"),
    Input("tab-analysis",  "n_clicks"),
    Input("tab-portfolio", "n_clicks"),
)
def _switch_tab(na, np_):
    ctx = callback_context
    trig = ctx.triggered[0]["prop_id"] if ctx.triggered else ""
    if "portfolio" in trig:
        return {"display": "none"}, {"display": "block"}, "nav-tab", "nav-tab active"
    return {"display": "block"}, {"display": "none"}, "nav-tab active", "nav-tab"


@app.callback(Output("sel-stock", "data"), Input("stock-search", "value"))
def _sel_stock(v):
    return v or DEFAULT_STOCK


@app.callback(
    Output("watchlist-items", "children"),
    Input("wl-interval", "n_intervals"),
    Input("sel-stock", "data"),
)
def _watchlist(_, sel):
    items = []
    for s in POPULAR_STOCKS[:8]:
        code, name = s["stock_code"], s["name"]
        try:
            q = get_live_quote(code)
            price = q["last_price"]
            chg   = q["change_pct"]
            color = C["buy"] if chg >= 0 else C["sell"]
            sign  = "+" if chg >= 0 else ""
        except Exception:
            price = chg = 0.0; color = C["text_muted"]; sign = ""
        items.append(html.Div(
            className=f"wl-item {'wl-selected' if code == sel else ''}",
            id={"type": "wl-btn", "code": code},
            n_clicks=0,
            children=[
                html.Div(className="wl-info", children=[
                    html.Div(code,      className="wl-code"),
                    html.Div(name[:20], className="wl-name"),
                ]),
                html.Div(className="wl-prices", children=[
                    html.Div(f"₹{price:,.2f}",     className="wl-price"),
                    html.Div(f"{sign}{chg:.2f}%",  className="wl-chg",
                             style={"color": color}),
                ]),
            ],
        ))
    return items


@app.callback(
    Output("stock-search", "value"),
    Input({"type": "wl-btn", "code": ALL}, "n_clicks"),
    State({"type": "wl-btn", "code": ALL}, "id"),
    prevent_initial_call=True,
)
def _wl_click(clicks, ids):
    ctx = callback_context
    if not ctx.triggered:
        return no_update
    raw = ctx.triggered[0]["prop_id"].split(".")[0]
    try:
        return _json.loads(raw)["code"]
    except Exception:
        return no_update


# ── Main data load: quote + charts + indicators ───────────────────────────────
@app.callback(
    Output("q-symbol",   "children"),
    Output("q-price",    "children"),
    Output("q-change",   "children"),
    Output("q-change",   "style"),
    Output("q-open",     "children"),
    Output("q-high",     "children"),
    Output("q-low",      "children"),
    Output("q-prev",     "children"),
    Output("q-vol",      "children"),
    Output("chart-main", "figure"),
    Output("chart-vol",  "figure"),
    Output("chart-rsi",  "figure"),
    Output("chart-macd", "figure"),
    Output("ind-store",  "data"),
    Output("ind-rsi",    "children"),
    Output("ind-macd",   "children"),
    Output("ind-macd-sig","children"),
    Output("ind-sma20",  "children"),
    Output("ind-sma50",  "children"),
    Output("ind-sma200", "children"),
    Output("ind-bb-up",  "children"),
    Output("ind-bb-lo",  "children"),
    Output("ind-atr",    "children"),
    Output("ind-stoch",  "children"),
    Output("t-stock-display", "children"),
    Output("t-ltp",      "children"),
    Input("sel-stock",     "data"),
    Input("quote-refresh", "n_clicks"),
)
def _load_stock(stock_code, _refresh):
    ef = _empty_fig()
    BLANK = ["-"] * 9 + [ef, ef, ef, ef, {}] + ["—"] * 10 + ["—", "—"]

    if not stock_code:
        return BLANK

    stock_name = next((s["name"] for s in POPULAR_STOCKS if s["stock_code"] == stock_code), stock_code)

    # Quote
    try:
        q     = get_live_quote(stock_code)
        ltp   = q["last_price"]
        chg   = q["change_pct"]
        sign  = "+" if chg >= 0 else ""
        q_sym = stock_code
        q_prc = f"₹{ltp:,.2f}"
        q_chg = f"{sign}{chg:.2f}%  ({sign}₹{q['change']:.2f})"
        q_col = {"color": C["buy"] if chg >= 0 else C["sell"]}
        q_o   = f"₹{q['open']:,.2f}"
        q_h   = f"₹{q['high']:,.2f}"
        q_l   = f"₹{q['low']:,.2f}"
        q_p   = f"₹{q['prev_close']:,.2f}"
        q_v   = f"{int(q['volume']):,}"
    except Exception as e:
        q_sym = stock_code; q_prc = "N/A"; q_chg = str(e)[:50]
        q_col = {"color": C["text_muted"]}
        q_o = q_h = q_l = q_p = q_v = "—"; ltp = 0.0

    # History + indicators
    try:
        df     = get_historical_data(stock_code, days=500)
        df_ind = add_indicators(df)
        ind    = latest_indicators(df_ind)

        # Candlestick + SMA overlays
        fig_main = go.Figure()
        fig_main.add_trace(go.Candlestick(
            x=df["datetime"],
            open=df["open"], high=df["high"], low=df["low"], close=df["close"],
            name="OHLC",
            increasing_line_color=C["buy"],  increasing_fillcolor=C["buy"],
            decreasing_line_color=C["sell"], decreasing_fillcolor=C["sell"],
            line=dict(width=1),
        ))
        for col, color, lbl in [("sma_20", C["sma20"], "SMA 20"),
                                  ("sma_50", C["sma50"], "SMA 50"),
                                  ("sma_200",C["sma200"],"SMA 200")]:
            if col in df_ind.columns:
                fig_main.add_trace(go.Scatter(
                    x=df_ind["datetime"], y=df_ind[col],
                    name=lbl, line=dict(color=color, width=1.2), opacity=0.85,
                ))
        fig_main.update_layout(**_chart_layout(
            title=dict(text=stock_name, font=dict(size=12, color=C["text"]), x=0.01),
            margin=dict(l=60, r=12, t=42, b=30),
        ))

        # Volume
        vol_colors = [C["buy"] if c >= o else C["sell"]
                      for c, o in zip(df["close"], df["open"])]
        fig_vol = go.Figure(go.Bar(
            x=df["datetime"], y=df["volume"],
            marker_color=vol_colors, name="Volume", opacity=0.65,
        ))
        fig_vol.update_layout(**_chart_layout(
            margin=dict(l=60, r=12, t=6, b=28), showlegend=False,
        ))

        # RSI
        fig_rsi = go.Figure()
        if "rsi" in df_ind.columns:
            fig_rsi.add_trace(go.Scatter(
                x=df_ind["datetime"], y=df_ind["rsi"],
                name="RSI 14", line=dict(color=C["primary"], width=1.5),
            ))
            fig_rsi.add_hline(y=70, line=dict(color=C["sell"], width=1, dash="dash"))
            fig_rsi.add_hline(y=30, line=dict(color=C["buy"],  width=1, dash="dash"))
            fig_rsi.add_hrect(y0=70, y1=100, fillcolor=C["sell"], opacity=0.04, line_width=0)
            fig_rsi.add_hrect(y0=0,  y1=30,  fillcolor=C["buy"],  opacity=0.04, line_width=0)
        fig_rsi.update_layout(**_chart_layout(
            margin=dict(l=60, r=12, t=6, b=28),
            yaxis=dict(range=[0, 100], gridcolor=C["border"], color=C["text_muted"]),
        ))

        # MACD
        fig_macd = go.Figure()
        if "macd" in df_ind.columns:
            h = df_ind["macd_hist"].fillna(0)
            fig_macd.add_trace(go.Bar(
                x=df_ind["datetime"], y=h, name="Histogram",
                marker_color=[C["buy"] if v >= 0 else C["sell"] for v in h],
                opacity=0.55,
            ))
            fig_macd.add_trace(go.Scatter(
                x=df_ind["datetime"], y=df_ind["macd"],
                name="MACD", line=dict(color=C["primary"], width=1.5),
            ))
            fig_macd.add_trace(go.Scatter(
                x=df_ind["datetime"], y=df_ind["macd_signal"],
                name="Signal", line=dict(color=C["hold"], width=1.5),
            ))
        fig_macd.update_layout(**_chart_layout(margin=dict(l=60, r=12, t=6, b=28)))

        def _fmt(k, d=2):
            v = ind.get(k)
            return "—" if v is None else f"{v:.{d}f}"

        ind_vals = [
            _fmt("rsi", 1), _fmt("macd"), _fmt("macd_signal"),
            _fmt("sma_20"), _fmt("sma_50"), _fmt("sma_200"),
            _fmt("bb_upper"), _fmt("bb_lower"), _fmt("atr"), _fmt("stoch_k", 1),
        ]

    except Exception as e:
        logging.error("load_stock error: %s", e)
        fig_main = fig_vol = fig_rsi = fig_macd = _empty_fig(str(e)[:60])
        ind = {}
        ind_vals = ["—"] * 10

    ltp_str = f"₹{ltp:,.2f}" if ltp else "—"

    return (
        q_sym, q_prc, q_chg, q_col, q_o, q_h, q_l, q_p, q_v,
        fig_main, fig_vol, fig_rsi, fig_macd,
        ind, *ind_vals,
        stock_code, ltp_str,
    )


# ── AI Prediction ─────────────────────────────────────────────────────────────
@app.callback(
    Output("signal-badge",  "children"),
    Output("signal-badge",  "className"),
    Output("conf-fill",     "style"),
    Output("conf-pct",      "children"),
    Output("pred-cur",      "children"),
    Output("pred-fore",     "children"),
    Output("pred-target",   "children"),
    Output("pred-stop",     "children"),
    Output("pred-reasoning","children"),
    Output("analyze-out",   "children"),
    Input("analyze-btn", "n_clicks"),
    State("sel-stock",   "data"),
    prevent_initial_call=True,
)
def _analyze(n, stock_code):
    if not n or not stock_code:
        return no_update
    try:
        df  = get_historical_data(stock_code, days=500)
        q   = get_live_quote(stock_code)
        res = generate_signal(stock_code, df, q["last_price"])

        sig   = res["signal"]
        conf  = res["confidence"]
        scls  = {"BUY": "buy", "SELL": "sell"}.get(sig, "hold")
        icons = {"BUY": "↑ BUY", "SELL": "↓ SELL", "HOLD": "— HOLD"}
        fill  = {
            "width": f"{conf}%",
            "background": f"linear-gradient(90deg, {C[scls]}, {C[scls]}88)",
        }
        reasons = html.Ul(
            [html.Li(r, className="reason-item") for r in res.get("reasoning", [])],
            className="reason-list",
        )
        return (
            icons.get(sig, sig), f"signal-badge sig-{scls}",
            fill, f"{conf:.1f}%",
            f"₹{res['current_price']:,.2f}",
            f"₹{res['predicted_price']:,.2f}",
            f"₹{res['target_price']:,.2f}",
            f"₹{res['stop_loss']:,.2f}",
            reasons, "",
        )
    except Exception as e:
        return (
            "Error", "signal-badge sig-hold",
            {"width": "0%"}, "0%",
            "—", "—", "—", "—",
            html.Div(f"Analysis failed: {e}", className="err-msg"),
            "",
        )


# ── Portfolio ─────────────────────────────────────────────────────────────────
@app.callback(
    Output("p-cash",      "children"),
    Output("p-invested",  "children"),
    Output("p-current",   "children"),
    Output("p-pnl",       "children"),
    Output("p-pnl",       "style"),
    Output("pos-table",   "children"),
    Output("trades-table","children"),
    Input("port-refresh",  "n_clicks"),
    Input("port-interval", "n_intervals"),
    Input("portfolio-page","style"),
)
def _portfolio(_, _t, page_style):
    if page_style and page_style.get("display") == "none":
        return no_update
    try:
        data = get_portfolio()
        pnl  = data["total_pnl"]
        sign = "+" if pnl >= 0 else ""
        pnl_col = {"color": C["buy"] if pnl >= 0 else C["sell"]}

        positions = data.get("positions", [])
        if positions:
            pos_tbl = dbc.Table(
                [html.Thead(html.Tr([
                    html.Th(h) for h in ["Stock","Qty","Avg Price","LTP","P&L","P&L %"]
                ])),
                html.Tbody([html.Tr([
                    html.Td(p["stock_code"]),
                    html.Td(p["quantity"]),
                    html.Td(f"₹{p['avg_buy_price']:,.2f}"),
                    html.Td(f"₹{p['current_price']:,.2f}"),
                    html.Td(f"{'+'if p['pnl']>=0 else ''}₹{p['pnl']:,.2f}",
                            style={"color": C["buy"] if p["pnl"] >= 0 else C["sell"]}),
                    html.Td(f"{'+'if p['pnl_pct']>=0 else ''}{p['pnl_pct']:.2f}%",
                            style={"color": C["buy"] if p["pnl_pct"] >= 0 else C["sell"]}),
                ]) for p in positions])],
                striped=True, hover=True, className="data-table", size="sm",
            )
        else:
            pos_tbl = html.Div("No open positions", className="empty-state")

        trades = data.get("trades", [])
        if trades:
            tr_tbl = dbc.Table(
                [html.Thead(html.Tr([html.Th(h) for h in ["#","Action","Stock","Qty","Price","Total","Time"]])),
                html.Tbody([html.Tr([
                    html.Td(i + 1),
                    html.Td(t.get("action",""),
                            style={"color": C["buy"] if t.get("action")=="BUY" else C["sell"], "fontWeight":"600"}),
                    html.Td(t.get("stock_code","")),
                    html.Td(t.get("quantity","")),
                    html.Td(f"₹{t.get('price',0):,.2f}"),
                    html.Td(f"₹{t.get('total',0):,.2f}"),
                    html.Td(str(t.get("timestamp",""))[:16]),
                ]) for i, t in enumerate(trades[-20:])])],
                striped=True, hover=True, className="data-table", size="sm",
            )
        else:
            tr_tbl = html.Div("No recent trades (read-only mode)", className="empty-state")

        return (
            f"₹{data['cash_balance']:,.2f}",
            f"₹{data['total_invested']:,.2f}",
            f"₹{data['total_current_value']:,.2f}",
            f"{sign}₹{abs(pnl):,.2f}  ({sign}{data['total_pnl_pct']:.2f}%)",
            pnl_col, pos_tbl, tr_tbl,
        )
    except Exception as e:
        err = html.Div(f"Portfolio error: {e}", className="err-msg")
        return "—", "—", "—", "Error", {"color": C["sell"]}, err, err


# ── Trade action tabs ─────────────────────────────────────────────────────────
@app.callback(
    Output("trade-action",  "data"),
    Output("t-buy-tab",     "className"),
    Output("t-sell-tab",    "className"),
    Input("t-buy-tab",  "n_clicks"),
    Input("t-sell-tab", "n_clicks"),
)
def _trade_action(_, __):
    ctx = callback_context
    trig = ctx.triggered[0]["prop_id"] if ctx.triggered else ""
    if "sell" in trig:
        return "SELL", "trade-tab t-buy", "trade-tab t-sell active"
    return "BUY", "trade-tab t-buy active", "trade-tab t-sell"


@app.callback(
    Output("t-total", "children"),
    Input("t-qty",         "value"),
    Input("t-ltp",         "children"),
    Input("trade-action",  "data"),
)
def _trade_total(qty, ltp_str, action):
    try:
        ltp   = float(str(ltp_str).replace("₹", "").replace(",", "")) if ltp_str and ltp_str != "—" else 0
        total = (qty or 0) * ltp
        col   = C["buy"] if action == "BUY" else C["sell"]
        return [html.Span("Total: ", className="total-label"),
                html.Span(f"₹{total:,.2f}", className="total-val", style={"color": col})]
    except Exception:
        return ""


@app.callback(
    Output("trade-status", "children"),
    Input("trade-btn", "n_clicks"),
    prevent_initial_call=True,
)
def _trade(_):
    return html.Span("App is in READ-ONLY mode — live trades disabled.", className="hold-msg")


if __name__ == "__main__":
    app.run(debug=True, port=8050, host="0.0.0.0")
