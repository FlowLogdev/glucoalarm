import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

export type ChartReading = { value_mgdl: number; recorded_at: number };
export type Thresholds = { critical_low: number; safe_low: number; safe_high: number; critical_high: number };
type TierCounts = { critical_high?: number; warn_high?: number; safe?: number; warn_low?: number; critical_low?: number; total?: number };

const WIDTH = Math.max(280, Dimensions.get("window").width - 68);
const HEIGHT = 238;
const PAD = { left: 38, right: 10, top: 12, bottom: 40 };
const colors = { critical: "#FB7185", warning: "#FBBF24", safe: "#34D399", grid: "#263244", text: "#94A3B8", panel: "#0B1220" };

function formatTime(seconds: number, timeZone?: string | null, includeDate = false) {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    timeZone: timeZone ?? undefined,
    month: includeDate ? "short" : undefined,
    day: includeDate ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GlucoseTrendChart({ readings, thresholds, timeZone, title = "Glucose trend" }: {
  readings: ChartReading[];
  thresholds: Thresholds;
  timeZone?: string | null;
  title?: string;
}) {
  if (!readings.length) return <View style={styles.empty}><Text style={styles.muted}>No readings in this range yet.</Text></View>;
  const ordered = [...readings].sort((a, b) => a.recorded_at - b.recorded_at);
  const values = ordered.map((r) => r.value_mgdl);
  const low = Math.max(40, Math.floor((Math.min(...values, thresholds.critical_low) - 20) / 20) * 20);
  const high = Math.max(300, Math.ceil((Math.max(...values, thresholds.critical_high) + 20) / 20) * 20);
  const chartW = WIDTH - PAD.left - PAD.right;
  const chartH = HEIGHT - PAD.top - PAD.bottom;
  const first = ordered[0].recorded_at;
  const last = ordered.at(-1)!.recorded_at;
  const span = Math.max(last - first, 1);
  const x = (r: ChartReading) => PAD.left + ((r.recorded_at - first) / span) * chartW;
  const y = (value: number) => PAD.top + ((high - value) / (high - low)) * chartH;
  const points = ordered.map((r) => `${x(r).toFixed(1)},${y(r.value_mgdl).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(low + ((high - low) * i) / 4));
  const labels = Array.from({ length: 4 }, (_, i) => first + ((last - first) * i) / 3);
  const latest = ordered.at(-1)!;
  const maximum = ordered.reduce((best, r) => r.value_mgdl > best.value_mgdl ? r : best, ordered[0]);
  const band = (from: number, to: number, fill: string) => <Rect key={`${from}-${to}`} x={PAD.left} y={y(to)} width={chartW} height={Math.max(0, y(from) - y(to))} fill={fill} opacity={0.12} />;

  return <View>
    <Text style={styles.chartTitle}>{title}</Text>
    <Svg width={WIDTH} height={HEIGHT} accessibilityLabel="Glucose trend chart with time and glucose readings">
      {band(low, thresholds.critical_low, colors.critical)}
      {band(thresholds.critical_low, thresholds.safe_low, colors.warning)}
      {band(thresholds.safe_low, thresholds.safe_high, colors.safe)}
      {band(thresholds.safe_high, thresholds.critical_high, colors.warning)}
      {band(thresholds.critical_high, high, colors.critical)}
      {ticks.map((tick) => <Line key={tick} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke={colors.grid} strokeWidth={1} />)}
      {ticks.map((tick) => <SvgText key={`label-${tick}`} x={PAD.left - 5} y={y(tick) + 4} fill={colors.text} fontSize="10" textAnchor="end">{tick}</SvgText>)}
      <Polyline points={points} fill="none" stroke="#22D3EE" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(latest)} cy={y(latest.value_mgdl)} r={4} fill="#22D3EE" stroke="#E0F2FE" strokeWidth={1.5} />
      <Circle cx={x(maximum)} cy={y(maximum.value_mgdl)} r={4} fill={colors.warning} stroke="#FEF3C7" strokeWidth={1.5} />
      {labels.map((point, index) => <SvgText key={point} x={PAD.left + (chartW * index) / 3} y={HEIGHT - 12} fill={colors.text} fontSize="9" textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"}>{formatTime(point, timeZone, index === 0 || new Date(point * 1000).getDate() !== new Date(first * 1000).getDate())}</SvgText>)}
    </Svg>
    <View style={styles.chartFacts}>
      <View><Text style={styles.factLabel}>Latest</Text><Text style={styles.factValue}>{latest.value_mgdl} mg/dL</Text><Text style={styles.muted}>{formatTime(latest.recorded_at, timeZone, true)}</Text></View>
      <View style={styles.factRight}><Text style={styles.factLabel}>Maximum</Text><Text style={[styles.factValue, { color: colors.warning }]}>{maximum.value_mgdl} mg/dL</Text><Text style={styles.muted}>{formatTime(maximum.recorded_at, timeZone, true)}</Text></View>
    </View>
  </View>;
}

const tierDefinitions = [
  ["critical_high", "Very high", colors.critical],
  ["warn_high", "High", colors.warning],
  ["safe", "In range", colors.safe],
  ["warn_low", "Low", colors.warning],
  ["critical_low", "Very low", colors.critical],
] as const;

export function TimeInRangeDonut({ tiers }: { tiers?: TierCounts }) {
  const total = tiers?.total ?? 0;
  if (!total) return <Text style={styles.muted}>No readings in this reporting period.</Text>;
  const circumference = 2 * Math.PI * 56;
  let offset = 0;
  return <View style={styles.donutRow}>
    <Svg width={145} height={145} viewBox="0 0 145 145">
      <Circle cx="72.5" cy="72.5" r="56" stroke="#182233" strokeWidth="18" fill="none" />
      {tierDefinitions.map(([key, _label, color]) => {
        const value = tiers?.[key] ?? 0;
        const length = Math.max(0, (value / total) * circumference - (value ? 3 : 0));
        const node = value ? <Circle key={key} cx="72.5" cy="72.5" r="56" stroke={color} strokeWidth="18" fill="none" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeLinecap="butt" rotation="-90" origin="72.5,72.5" /> : null;
        offset += (value / total) * circumference;
        return node;
      })}
      <SvgText x="72.5" y="68" fill="#F8FAFC" fontSize="23" fontWeight="700" textAnchor="middle">{Math.round(((tiers?.safe ?? 0) / total) * 100)}%</SvgText>
      <SvgText x="72.5" y="87" fill={colors.text} fontSize="10" textAnchor="middle">in range</SvgText>
    </Svg>
    <View style={styles.legend}>
      {tierDefinitions.map(([key, label, color]) => {
        const value = tiers?.[key] ?? 0;
        if (!value) return null;
        return <View key={key} style={styles.legendRow}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text><Text style={styles.legendValue}>{value} · {Math.round((value / total) * 100)}%</Text></View>;
      })}
      <Text style={styles.muted}>{total} captured readings</Text>
    </View>
  </View>;
}

export function A1CSummary({ estimates }: { estimates: { key: string; label: string; estimatedA1c: number | null; averageMgdl: number | null; readingCount: number }[] }) {
  const headline = estimates.find((item) => item.key === "30d") ?? estimates.find((item) => item.estimatedA1c != null);
  return <View>
    {headline ? <View style={styles.a1cHeadline}><Text style={styles.a1cValue}>{headline.estimatedA1c}%</Text><View><Text style={styles.factLabel}>Estimated GMI · {headline.label}</Text><Text style={styles.muted}>Average {headline.averageMgdl} mg/dL · {headline.readingCount} readings</Text></View></View> : <Text style={styles.muted}>Not enough readings for an estimate yet.</Text>}
    <View style={styles.a1cWindows}>{estimates.map((item) => <View key={item.key} style={styles.a1cWindow}><Text style={styles.factLabel}>{item.label}</Text><Text style={styles.windowValue}>{item.estimatedA1c == null ? "—" : `${item.estimatedA1c}%`}</Text><Text style={styles.muted}>{item.averageMgdl == null ? "Not enough data" : `avg ${item.averageMgdl}`}</Text></View>)}</View>
    <Text style={styles.disclaimer}>Calculated from this person’s CGM readings using the Glucose Management Indicator (GMI) formula. It is an estimate, not a Dexcom-provided or laboratory A1C result.</Text>
  </View>;
}

const styles = StyleSheet.create({
  empty: { minHeight: 130, alignItems: "center", justifyContent: "center" },
  muted: { color: "#94A3B8", fontSize: 11, lineHeight: 16 },
  chartTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  chartFacts: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#1E293B" },
  factLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  factValue: { color: "#F8FAFC", fontSize: 16, fontWeight: "800", marginTop: 2 },
  factRight: { alignItems: "flex-end" },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legend: { flex: 1, gap: 7 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#CBD5E1", fontSize: 12, flex: 1 },
  legendValue: { color: "#F8FAFC", fontSize: 12, fontWeight: "700" },
  a1cHeadline: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  a1cValue: { color: "#22D3EE", fontSize: 38, fontWeight: "800", letterSpacing: -1 },
  a1cWindows: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  a1cWindow: { backgroundColor: "#111827", borderRadius: 12, padding: 9, minWidth: 92, flexGrow: 1 },
  windowValue: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", marginVertical: 2 },
  disclaimer: { color: "#64748B", fontSize: 11, lineHeight: 16, marginTop: 11 },
});
