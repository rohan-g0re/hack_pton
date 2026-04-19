/**
 * Builds caretaker-facing iMessage alert text from medication event context.
 * Text-first, minimal PHI, actionable.
 */

export function shouldSendImmediate(adherence) {
  return adherence === "missed" || adherence === "partial" || adherence === "uncertain";
}

export function buildMedicationAlertMessage({
  adherence,
  patientName,
  missedMedications = [],
  eventId = null,
  capturedAt = null
}) {
  const shortId = eventId ? String(eventId).slice(0, 8) : null;
  const timeStr = capturedAt
    ? new Date(capturedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  let header, detail, action;

  if (adherence === "missed") {
    const meds = missedMedications.length ? missedMedications.join(", ") : "medication";
    header = `\u26A0\uFE0F Medication Alert — ${patientName}`;
    detail = `${patientName} has not taken ${meds}${timeStr ? ` (checked at ${timeStr})` : ""}.`;
    action = "Please check in with them.";
  } else if (adherence === "partial") {
    const meds = missedMedications.length ? missedMedications.join(", ") : "some medication";
    header = `\u26A0\uFE0F Partial Medication — ${patientName}`;
    detail = `${patientName} took some medications but missed ${meds}${timeStr ? ` (${timeStr})` : ""}.`;
    action = "Please verify they take the remaining dose.";
  } else if (adherence === "uncertain") {
    header = `\uD83D\uDD0D Medication Unclear — ${patientName}`;
    detail = `The camera could not confirm ${patientName} took their medication${timeStr ? ` at ${timeStr}` : ""}.`;
    action = "Please check in to confirm.";
  } else {
    return null;
  }

  const ackLine = shortId ? `\nReply: ack ${shortId}` : "";
  return `${header}\n${detail} ${action}${ackLine}`;
}
