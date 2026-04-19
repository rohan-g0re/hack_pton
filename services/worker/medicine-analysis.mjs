function parseTodayTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function timeDiffMinutes(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

/**
 * @param {Array<object>} prescriptions DB rows: medicine_name, expected_count, scheduled_time, window_minutes
 * @param {Date} capturedAt
 */
export function prescriptionsDueNow(prescriptions, capturedAt) {
  return prescriptions.filter((entry) => {
    const scheduled = parseTodayTime(String(entry.scheduled_time || entry.scheduledTime).slice(0, 5));
    return timeDiffMinutes(capturedAt, scheduled) <= Number(entry.window_minutes || entry.windowMinutes);
  });
}

