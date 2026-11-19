import type { AdminLayer, AdminOperationTree } from '../api/types'

/**
 * 작전 표시 이름: "L1-2. 작전 이름" (레이어 순서 - 레이어 안 작전 순서).
 * 레이어 목록이 없으면 "2. 작전 이름"
 */
export function operationLabel(op: AdminOperationTree, layers: AdminLayer[]): string {
  const layer = layers.find((l) => l.layerId === op.layerId)
  return layer ? `L${layer.sortOrder}-${op.sortOrder}. ${op.name}` : `${op.sortOrder}. ${op.name}`
}
