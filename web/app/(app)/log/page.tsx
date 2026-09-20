export default function LogPage() {
  return (
    <section>
      <h1>Glucose data only</h1>
      <p className="meta">
        GlucoAlarm shows shared glucose readings, trends, reports, and caregiver alerts. It does
        not collect, display, calculate, or recommend insulin doses.
      </p>
      <a className="history-link" href="/dashboard">Go to Dashboard →</a>
    </section>
  );
}
