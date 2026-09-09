"use client";

import { useEffect, useState } from "react";
import { generateInsight, getInsight, type Insight, type ReportPeriod } from "./api";
import { formatDateTime } from "./format";

export function InsightCard({ personId, period }: { personId: string; period: ReportPeriod }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInsight(null);
    getInsight(personId, period)
      .then(setInsight)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [personId, period]);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      setInsight(await generateInsight(personId, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate insight");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Time-of-day pattern</h3>
      {insight ? (
        <>
          <p>{insight.summary}</p>
          <p className="meta">Generated {formatDateTime(insight.generated_at)}</p>
        </>
      ) : (
        <p className="meta">No insight generated yet for this period.</p>
      )}
      <button onClick={onGenerate} disabled={loading}>
        {loading ? "Generating…" : insight ? "Regenerate" : "Generate insight"}
      </button>
      {error && <p className="meta">{error}</p>}
      <p className="meta" style={{ marginTop: "0.75rem" }}>
        AI-written pattern summary from readings only, not medical advice, and never a dosing
        suggestion.
      </p>
    </div>
  );
}
