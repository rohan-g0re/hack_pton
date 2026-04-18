import { createSeedState } from "./demo-data.mjs";

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function timeDiffMinutes(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function parseTodayTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function sumDetected(sceneItems, name) {
  return sceneItems
    .filter((item) => item.name.toLowerCase() === name.toLowerCase())
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function cameraStatusFromTimestamps(camera) {
  if (!camera.lastSeenAt) {
    return "offline";
  }

  const ageMs = Date.now() - new Date(camera.lastSeenAt).getTime();
  if (ageMs > 120000) {
    return "stale";
  }

  return "online";
}

export class DemoStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = createSeedState();
  }

  getScene(role, sceneId) {
    return this.state.scenes[role]?.find((scene) => scene.id === sceneId) || null;
  }

  getCamera(role) {
    return this.state.cameras.find((camera) => camera.role === role);
  }

  listState() {
    const state = clone(this.state);
    state.cameras = state.cameras.map((camera) => ({
      ...camera,
      status: cameraStatusFromTimestamps(camera)
    }));
    return state;
  }

  updateProfile(payload) {
    if (payload.caretakerName) {
      this.state.caretaker.name = String(payload.caretakerName);
    }
    if (payload.phone) {
      this.state.caretaker.phone = String(payload.phone);
    }
    if (payload.patientName) {
      this.state.patient.name = String(payload.patientName);
    }

    this.pushEvent({
      type: "profile",
      severity: "info",
      title: "Profile updated",
      message: "Caretaker and patient details were updated from the dashboard."
    });

    return this.listState();
  }

  replaceInventory(items) {
    this.state.inventory = items.map((item, index) => ({
      id: item.id || `inv-${index + 1}`,
      name: String(item.name),
      targetQuantity: Number(item.targetQuantity),
      lowStockThreshold: Number(item.lowStockThreshold),
      preferredMerchant: String(item.preferredMerchant || "Walmart")
    }));

    this.pushEvent({
      type: "inventory",
      severity: "info",
      title: "Inventory updated",
      message: "The pantry baseline was updated by the caretaker."
    });

    return this.listState();
  }

  replacePrescriptions(items) {
    this.state.prescriptions = items.map((item, index) => ({
      id: item.id || `rx-${index + 1}`,
      medicineName: String(item.medicineName),
      expectedCount: Number(item.expectedCount),
      scheduledTime: String(item.scheduledTime),
      windowMinutes: Number(item.windowMinutes),
      purpose: String(item.purpose || "")
    }));

    this.pushEvent({
      type: "prescription",
      severity: "info",
      title: "Prescription updated",
      message: "The medication schedule was updated by the caretaker."
    });

    return this.listState();
  }

  registerCamera(role, payload) {
    const camera = this.getCamera(role);
    if (!camera) {
      throw new Error(`Unknown camera role: ${role}`);
    }

    camera.deviceName = payload.deviceName || `${role} browser device`;
    camera.lastSeenAt = nowIso();
    camera.status = "online";

    this.pushEvent({
      type: "camera",
      severity: "info",
      title: `${camera.label} registered`,
      message: `${camera.deviceName} is connected and ready to upload snapshots.`
    });

    return clone(camera);
  }

  recordSnapshot(role, payload) {
    const camera = this.getCamera(role);
    if (!camera) {
      throw new Error(`Unknown camera role: ${role}`);
    }

    camera.lastSeenAt = nowIso();
    camera.lastSnapshotAt = payload.capturedAt || nowIso();
    camera.lastSceneId = payload.sceneId;
    camera.status = "online";

    if (role === "pantry") {
      return this.analyzePantry(payload);
    }

    return this.analyzeMedication(payload);
  }

  analyzePantry(payload) {
    const scene = this.getScene("pantry", payload.sceneId);
    if (!scene) {
      throw new Error("Unknown pantry scene.");
    }

    const lowItems = this.state.inventory
      .map((item) => {
        const detectedQuantity = sumDetected(scene.items, item.name);
        const reorderQuantity = Math.max(item.targetQuantity - detectedQuantity, 0);
        return {
          name: item.name,
          detectedQuantity,
          targetQuantity: item.targetQuantity,
          threshold: item.lowStockThreshold,
          reorderQuantity
        };
      })
      .filter((item) => item.detectedQuantity <= item.threshold);

    const analysis = {
      id: makeId("pantry-analysis"),
      role: "pantry",
      sceneId: scene.id,
      sceneLabel: scene.label,
      confidence: scene.confidence,
      uncertainty: scene.uncertainty,
      lowItems,
      createdAt: nowIso()
    };

    if (scene.uncertainty || scene.confidence < 0.6) {
      const proposal = this.createProposal(analysis, "review");
      this.pushEvent({
        type: "pantry",
        severity: "warning",
        title: "Pantry review needed",
        message: "Pantry detection was uncertain. Review the proposal before ordering anything."
      });
      return { analysis, proposal };
    }

    if (lowItems.length === 0) {
      this.pushEvent({
        type: "pantry",
        severity: "success",
        title: "Pantry looks healthy",
        message: "No replenishment is needed from the latest pantry snapshot."
      });
      return { analysis, proposal: null };
    }

    const proposal = this.createProposal(analysis, "awaiting_approval");
    this.pushEvent({
      type: "pantry",
      severity: "warning",
      title: "Low stock detected",
      message: `Proposed replenishment for ${lowItems.map((item) => item.name).join(", ")}.`
    });

    return { analysis, proposal };
  }

  createProposal(analysis, status) {
    const existing = this.state.proposals.find((proposal) => {
      if (!["awaiting_approval", "review"].includes(proposal.status)) {
        return false;
      }

      const currentSignature = proposal.items.map((item) => `${item.name}:${item.reorderQuantity}`).join("|");
      const nextSignature = analysis.lowItems.map((item) => `${item.name}:${item.reorderQuantity}`).join("|");
      return currentSignature === nextSignature;
    });

    if (existing) {
      existing.updatedAt = nowIso();
      existing.status = status;
      existing.confidence = analysis.confidence;
      return clone(existing);
    }

    const proposal = {
      id: makeId("proposal"),
      status,
      confidence: analysis.confidence,
      merchant: "Walmart",
      estimatedTotal: analysis.lowItems.reduce((sum, item) => sum + item.reorderQuantity * 4.25, 0),
      items: analysis.lowItems,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    this.state.proposals.unshift(proposal);
    return clone(proposal);
  }

  approveProposal(id) {
    const proposal = this.state.proposals.find((item) => item.id === id);
    if (!proposal) {
      throw new Error("Proposal not found.");
    }

    proposal.status = "approved";
    proposal.updatedAt = nowIso();

    const checkout = {
      id: makeId("checkout"),
      proposalId: proposal.id,
      provider: "Knot sandbox",
      status: "success",
      createdAt: nowIso()
    };

    this.state.checkoutSessions.unshift(checkout);
    proposal.checkoutId = checkout.id;
    proposal.status = "completed";

    this.pushEvent({
      type: "checkout",
      severity: "success",
      title: "Sandbox checkout completed",
      message: `Knot sandbox checkout completed for ${proposal.items.map((item) => item.name).join(", ")}.`
    });

    return { proposal: clone(proposal), checkout };
  }

  rejectProposal(id) {
    const proposal = this.state.proposals.find((item) => item.id === id);
    if (!proposal) {
      throw new Error("Proposal not found.");
    }

    proposal.status = "rejected";
    proposal.updatedAt = nowIso();
    this.pushEvent({
      type: "checkout",
      severity: "info",
      title: "Proposal rejected",
      message: "The caretaker rejected the pantry replenishment proposal."
    });

    return clone(proposal);
  }

  analyzeMedication(payload) {
    const scene = this.getScene("medicine", payload.sceneId);
    if (!scene) {
      throw new Error("Unknown medicine scene.");
    }

    const capturedAt = new Date(payload.capturedAt || nowIso());
    const dueEntries = this.state.prescriptions.filter((entry) => {
      const scheduled = parseTodayTime(entry.scheduledTime);
      return timeDiffMinutes(capturedAt, scheduled) <= entry.windowMinutes;
    });

    const expectedNames = dueEntries.map((entry) => entry.medicineName.toLowerCase());
    const takenNames = scene.medsTaken.map((entry) => entry.name.toLowerCase());

    let severity = "success";
    let title = "Medication taken correctly";
    let message = "All scheduled medicines were taken in the correct quantity.";
    let adherenceStatus = "taken";

    const wrongCount = dueEntries.some((entry) => {
      const observed = scene.medsTaken.find((item) => item.name.toLowerCase() === entry.medicineName.toLowerCase());
      return !observed || observed.count !== entry.expectedCount;
    });

    const unknownMedicine = takenNames.some((name) => !expectedNames.includes(name));
    const noScheduleDue = dueEntries.length === 0;

    if (scene.uncertainty || scene.confidence < 0.6) {
      severity = "warning";
      title = "Medication check is uncertain";
      message = "The medicine snapshot was inconclusive. Please check on the patient directly.";
      adherenceStatus = "uncertain";
    } else if (noScheduleDue) {
      severity = "info";
      title = "No medication due right now";
      message = "The latest medicine snapshot arrived outside the active adherence window.";
      adherenceStatus = "outside_window";
    } else if (scene.medsTaken.length === 0 || wrongCount || unknownMedicine) {
      severity = "critical";
      title = "Medication alert";
      message = unknownMedicine
        ? "An unexpected medicine appears to have been taken. Please check on the patient."
        : "Scheduled medicines were missed or taken incorrectly. Please check on the patient.";
      adherenceStatus = "alert";
    }

    const event = this.pushEvent({
      type: "medication",
      severity,
      title,
      message
    });

    const notification = {
      id: makeId("notify"),
      channel: "Photon iMessage",
      deliveryStatus: "sent",
      relatedEventId: event.id,
      recipient: this.state.caretaker.phone,
      sentAt: nowIso(),
      message
    };

    this.state.notifications.unshift(notification);

    return {
      status: adherenceStatus,
      confidence: scene.confidence,
      dueEntries,
      sceneLabel: scene.label,
      event,
      notification
    };
  }

  pushEvent(input) {
    const event = {
      id: makeId("evt"),
      createdAt: nowIso(),
      ...input
    };

    this.state.events.unshift(event);
    return event;
  }
}
