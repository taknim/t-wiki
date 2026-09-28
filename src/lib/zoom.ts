/*
 * 보기 배율.
 *
 * 그림을 볼 때도, 잘라 낼 자리를 고를 때도 같은 걸음을 씁니다. 두 곳이 서로 다른 단계를
 * 쓰면 같은 단추를 눌러도 다르게 움직여 헷갈립니다.
 */

/** 배율의 단계. 100% 는 그림이 지닌 크기 그대로입니다. */
export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

/** 지금 배율에서 한 걸음 옮긴 배율. 끝에서는 그대로 둡니다. */
export function stepZoom(zoom: number, delta: number): number {
  const at = ZOOMS.indexOf(zoom)
  const from = at === -1 ? ZOOMS.indexOf(1) : at
  return ZOOMS[Math.min(Math.max(from + delta, 0), ZOOMS.length - 1)]
}
