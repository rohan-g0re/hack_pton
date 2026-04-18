function sumDetected(sceneItems, name) {
  return sceneItems
    .filter((item) => item.name.toLowerCase() === name.toLowerCase())
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

/**
 * @param {Array<{ name: string; targetQuantity: number; lowStockThreshold: number }>} inventory
 * @param {{ items: Array<{ name: string; quantity: number }>; confidence: number; uncertainty?: boolean }} scene
 */
export function buildLowStockItems(inventory, scene) {
  return inventory
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
}

export function proposalSignature(lowItems) {
  return lowItems
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => `${item.name}:${item.reorderQuantity}`)
    .join("|");
}
