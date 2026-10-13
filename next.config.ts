import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NAS(Synology DS218+)의 Docker 컨테이너로 옮기기 위한 설정.
  // 빌드 결과가 .next/standalone 아래에 자립 실행 가능한 형태로 나온다.
  output: "standalone",

  /**
   * 개발 서버를 localhost 가 아닌 주소로 열 때 허용할 곳.
   *
   * 이것이 없으면 Next 가 개발 전용 리소스(HMR 웹소켓·폰트)를 막는다. 그러면
   * 화면은 멀쩡히 뜨는데 **React 가 붙지 않아** 버튼이 전부 죽는다. 오류 문구가
   * 나지 않아 코드를 의심하게 되는 종류의 고장이다 — 계측기 시스템(njlee)에서
   * 실제로 겪었고 "인쇄 버튼만 안 되는" 것처럼 보여 원인을 찾는 데 시간이 걸렸다.
   *
   * 사내망 대역을 통째로 적어 둔다. 이 PC 의 Wi-Fi 주소는 자주 바뀌는데,
   * 바뀔 때마다 여기까지 고치게 하면 결국 또 빠뜨린다.
   *
   * 칸마다 별표 하나씩 네 칸(192.168.*.*)이어야 한다. Next 의 대조기는 칸을
   * 뒤에서부터 하나씩 맞추고 마지막에 남은 칸이 없어야 통과시키므로
   * (node_modules/next/dist/server/app-render/csrf-protection.js),
   * "192.168.*" 나 "192.168.**" 는 칸 수가 모자라 오히려 막힌다 — 개선요청
   * 시스템에서 실측으로 확인했다. 줄여 쓰고 싶어지더라도 그대로 둘 것.
   * (개발 서버에만 적용된다. next build 결과에는 영향이 없다.)
   */
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
