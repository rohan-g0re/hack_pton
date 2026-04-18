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

/**
 * @param {object} scene from demo scenes.medicine
 * @param {Array<object>} dueEntries prescriptions due
 */
export function adherenceFromScene(scene, dueEntries) {
  const expectedNames = dueEntries.map((entry) =>
    String(entry.medicine_name || entry.medicineName).toLowerCase()
  );
  const takenNames = scene.medsTaken.map((entry) => entry.name.toLowerCase());

  if (scene.uncertainty || scene.confidence < 0.6) {
    return {
      adherence: "uncertain",
      severity: "warning",
      title: "Medication check is uncertain",
      message: "The medicine snapshot was inconclusive. Please check on the patient directly."
    };
  }

  if (dueEntries.length === 0) {
    return {
      adherence: "outside_window",
      severity: "info",
      title: "No medication due right now",
      message: "The latest medicine snapshot arrived outside the active adherence window."
    };
  }

  const wrongCount = dueEntries.some((entry) => {
    const name = String(entry.medicine_name || entry.medicineName);
    const observed = scene.medsTaken.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const expected = Number(entry.expected_count ?? entry.expectedCount);
    return !observed || observed.count !== expected;
  });

  const unknownMedicine = takenNames.some((name) => !expectedNames.includes(name));

  if (scene.medsTaken.length === 0 || wrongCount || unknownMedicine) {
    let adherence = "missed";
    if (unknownMedicine) {
      adherence = "wrong_pill";
    } else if (wrongCount) {
      adherence = "missed";
    }
    return {
      adherence,
      severity: "critical",
      title: "Medication alert",
      message: unknownMedicine
        ? "An unexpected medicine appears to have been taken. Please check on the patient."
        : "Scheduled medicines were missed or taken incorrectly. Please check on the patient."
    };
  }

  return {
    adherence: "taken",
    severity: "success",
    title: "Medication taken correctly",
    message: "All scheduled medicines were taken in the correct quantity."
  };
}
