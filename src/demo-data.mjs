function isoNow() {
  return new Date().toISOString();
}

function hhmmFrom(date) {
  return date.toTimeString().slice(0, 5);
}

/** Scene catalog for demo / worker simulation (same data as seeded dashboard). */
export function getSeedScenes() {
  return createSeedState().scenes;
}

export function createSeedState() {
  const now = new Date();
  const scheduled = new Date(now.getTime());

  return {
    meta: {
      createdAt: isoNow(),
      demoMode: true
    },
    caretaker: {
      id: "caretaker-1",
      name: "Rohan Shah",
      phone: "+1 609-555-0144"
    },
    patient: {
      id: "patient-1",
      name: "Mira Shah",
      relationship: "Grandmother"
    },
    paymentCard: {
      brand: "VISA",
      last4: "4242",
      status: "active"
    },
    cameras: [
      {
        id: "camera-pantry",
        role: "pantry",
        label: "Pantry Nanny Cam",
        deviceName: "Unregistered device",
        lastSeenAt: null,
        lastSnapshotAt: null,
        lastSceneId: null,
        status: "offline"
      },
      {
        id: "camera-medicine",
        role: "medicine",
        label: "Medicine Nanny Cam",
        deviceName: "Unregistered device",
        lastSeenAt: null,
        lastSnapshotAt: null,
        lastSceneId: null,
        status: "offline"
      }
    ],
    inventory: [
      { id: "inv-milk", name: "Milk", targetQuantity: 2, lowStockThreshold: 1, preferredMerchant: "Walmart" },
      { id: "inv-bananas", name: "Bananas", targetQuantity: 6, lowStockThreshold: 2, preferredMerchant: "Walmart" },
      { id: "inv-oatmeal", name: "Oatmeal", targetQuantity: 2, lowStockThreshold: 1, preferredMerchant: "Walmart" },
      { id: "inv-apples", name: "Apples", targetQuantity: 5, lowStockThreshold: 2, preferredMerchant: "Walmart" }
    ],
    prescriptions: [
      {
        id: "rx-allergy",
        medicineName: "Allergy Relief",
        expectedCount: 1,
        scheduledTime: hhmmFrom(scheduled),
        windowMinutes: 30,
        purpose: "Seasonal allergy control"
      },
      {
        id: "rx-vitamin",
        medicineName: "Vitamin D",
        expectedCount: 1,
        scheduledTime: hhmmFrom(scheduled),
        windowMinutes: 30,
        purpose: "Daily vitamin support"
      }
    ],
    proposals: [],
    events: [
      {
        id: "evt-welcome",
        type: "system",
        severity: "info",
        title: "Demo household ready",
        message: "Dashboard initialized for one caretaker, one patient, and two camera roles.",
        createdAt: isoNow()
      }
    ],
    notifications: [],
    checkoutSessions: [],
    scenes: {
      pantry: [
        {
          id: "pantry-full",
          label: "Healthy pantry",
          description: "All major grocery items are clearly visible in healthy quantities.",
          items: [
            { name: "Milk", quantity: 2 },
            { name: "Bananas", quantity: 6 },
            { name: "Oatmeal", quantity: 2 },
            { name: "Apples", quantity: 5 }
          ],
          confidence: 0.96,
          uncertainty: false
        },
        {
          id: "pantry-low",
          label: "Low stock pantry",
          description: "Milk and bananas are almost gone. Oatmeal is missing from the shelf.",
          items: [
            { name: "Milk", quantity: 0 },
            { name: "Bananas", quantity: 1 },
            { name: "Oatmeal", quantity: 0 },
            { name: "Apples", quantity: 3 }
          ],
          confidence: 0.91,
          uncertainty: false
        },
        {
          id: "pantry-uncertain",
          label: "Cluttered / uncertain pantry",
          description: "The camera angle is partially blocked and the scene is hard to interpret.",
          items: [
            { name: "Milk", quantity: 1 },
            { name: "Bananas", quantity: 2 }
          ],
          confidence: 0.48,
          uncertainty: true
        }
      ],
      medicine: [
        {
          id: "medicine-taken",
          label: "Taken correctly",
          description: "Both scheduled medicines were taken in the correct count.",
          medsTaken: [
            { name: "Allergy Relief", count: 1 },
            { name: "Vitamin D", count: 1 }
          ],
          confidence: 0.93,
          uncertainty: false
        },
        {
          id: "medicine-missed",
          label: "Missed medication",
          description: "No tablets appear to have been taken.",
          medsTaken: [],
          confidence: 0.9,
          uncertainty: false
        },
        {
          id: "medicine-wrong-pill",
          label: "Wrong medicine",
          description: "A different medicine appears to have been taken.",
          medsTaken: [
            { name: "Pain Relief", count: 1 }
          ],
          confidence: 0.87,
          uncertainty: false
        },
        {
          id: "medicine-uncertain",
          label: "Uncertain detection",
          description: "The pill packet is partially obscured and the count is not reliable.",
          medsTaken: [
            { name: "Allergy Relief", count: 1 }
          ],
          confidence: 0.45,
          uncertainty: true
        }
      ]
    }
  };
}
