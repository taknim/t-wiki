/*
 * 보기 배율.
 *
 * 그림을 볼 때도, 잘라 낼 자리를 고를 때도 같은 걸음을 씁니다. 두 곳이 서로 다른 단계를
 * 쓰면 같은 단추를 눌러도 다르게 움직여 헷갈립니다.
 */

/** 배율의 단계. 100% 는 그림이 지닌 크기 그대로입니다. */
export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

/**
 * 지금 배율에서 한 걸음 옮긴 배율. 끝에서는 그대로 둡니다.
 *
 * 표에 없는 값에서도 세어야 합니다. 화면 맞춤은 칸에 따라 37% 처럼 어중간한 값이 되는데,
 * 표에서 자리를 못 찾아 100% 부터 세었더니 37% 에서 크게 보기를 눌렀는데 150% 로 건너뛰었습니다.
 * 지금 값보다 바로 위(또는 바로 아래) 눈금으로 갑니다.
 */
export function stepZoom(zoom: number, delta: number): number {
  // 재서 나온 값은 소수점 아래가 지저분합니다. 0.5% 안쪽은 같은 값으로 봅니다.
  const near = 0.005
  if (delta > 0) return ZOOMS.find((one) => one > zoom + near) ?? ZOOMS[ZOOMS.length - 1]
  return [...ZOOMS].reverse().find((one) => one < zoom - near) ?? ZOOMS[0]
}
