/**
 * ChartContainer — the modular shell for every chart in the app.
 *
 * Usage:
 *   <ChartContainer title="RSI" legend={[{color:'#f59e0b', label:'RSI 14'}]}>
 *     <RsiChart data={series.rsi} />
 *   </ChartContainer>
 *
 * To add a new chart, just:
 *   1. Create a new XxxChart component
 *   2. Register it in chartRegistry.js
 *   3. Drop it inside a <ChartContainer>
 */
export default function ChartContainer({ title, legend = [], children, style = {} }) {
  return (
    <div className="chart-container" style={style}>
      <div className="chart-header">
        <div className="chart-title">{title}</div>
        {legend.length > 0 && (
          <div className="chart-legend">
            {legend.map((item) => (
              <div key={item.label} className="legend-item">
                <div className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-body">{children}</div>
    </div>
  )
}
