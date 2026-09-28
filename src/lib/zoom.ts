/*
 * 보기 배율.
 *
 * 그림을 볼 때도, 잘라 낼 자리를 고를 때도 같은 걸음을 씁니다. 두 곳이 서로 다른 단계를
 * 쓰면 같은 단추를 눌러도 다르게 움직여 헷갈립니다.
 */

/**
 * 배율의 단계.
 *
 * 작을 때는 20% 씩, 100% 를 넘으면 25% 씩, 200% 를 넘으면 50% 씩 벌립니다.
 * 작은 쪽은 한 걸음이 눈에 크게 다가오고 큰 쪽은 덜하기 때문입니다 — 같은 20% 라도
 * 40 → 60 은 한눈에 달라 보이지만 250 → 270 은 거의 같아 보입니다.
 * 맨 아래 10% 는 따로 둡니다. 아주 큰 그림은 20% 로도 한 화면에 들지 않습니다.
 */
export const ZOOMS = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** 손으로 적어 넣을 수 있는 배율의 끝(%). */
export const MIN_PERCENT = 10
export const MAX_PERCENT = 300

/** 적어 넣은 값을 쓸 수 있는 자리로 눌러 둡니다. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100
  return Math.min(Math.max(Math.round(percent), MIN_PERCENT), MAX_PERCENT)
}

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

/**
 * 배율을 손으로 적어 넣습니다. 단계로는 닿지 않는 값(110% 같은)을 쓰려는 때와,
 * 여러 그림을 같은 배율로 견주려는 때에 씁니다. 물러서면 null.
 *
 * 창을 띄우는 길을 여기 한 자리에 둡니다 — 그림 위 손잡이와 단축키가 같은 것을 부르고,
 * 묻는 말과 값의 끝이 두 곳에서 어긋나지 않습니다.
 */
export async function askZoomPercent(
  ask: (options: {
    title: string
    label: string
    fields: { id: string; label: string; value: number; min: number; max?: number; suffix?: string }[]
    confirmText?: string
  }) => Promise<Record<string, number> | null>,
  current: number,
): Promise<number | null> {
  const answer = await ask({
    title: '배율 정하기',
    label: `${MIN_PERCENT} 에서 ${MAX_PERCENT} 사이로 적습니다. 그 밖의 값은 가까운 끝으로 맞춥니다.`,
    // 이름은 창 이름으로 갈음하고 단위만 칸 뒤에 붙입니다. "배율" 을 두 번 적을 까닭이 없습니다.
    fields: [{
      id: 'percent',
      label: '',
      suffix: '%',
      value: clampPercent(Math.round(current * 100)),
      min: MIN_PERCENT,
      max: MAX_PERCENT,
    }],
    confirmText: '맞추기',
  })
  return answer ? clampPercent(answer.percent) / 100 : null
}
