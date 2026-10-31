export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function attendedVisit(c: any) {
  return c.workflow_data?.followup_state === 'आ गया' &&
    (c.workflow_data.followup_for || c.next_followup_date) === c.next_followup_date;
}
