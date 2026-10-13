/**
 * 개발용 가짜 데이터.   npm run seed:dev
 *
 * - SEED_DEV_ENABLED=true 일 때만 돈다. 이 스크립트는 **DB 에 글을 쓴다** —
 *   깃발이 없으면 운영 DB 를 가리킨 .env.local 로도 가짜 데이터가 들어간다.
 *   그래서 기본값은 반드시 꺼짐이고, 개발 DB 에서만 켠다.
 * - 글이 하나도 없을 때만 넣는다. **기존 데이터를 지우거나 덮어쓰지 않는다.**
 * - 글과 이름은 전부 가짜다. 화면 모양을 확인하기 위한 것이다.
 */
process.loadEnvFile(".env.local");

/**
 * 가짜 글의 작성자. **실제 사원 명단이 아니다.**
 *
 * 예전에는 개발용 임시 로그인의 계정 목록을 빌려 썼다. 2026-10-13 에 임시
 * 로그인을 걷어내면서 이 파일 안으로 옮겼다 — 이제 이 스크립트는 인증 코드에
 * 기대지 않는다.
 *
 * sub 는 포털이 주는 sub(UUID) 자리를 대신하는 고정값이다. 아래 SEEDS 의
 * `author` 가 이 배열의 **인덱스**를 가리키므로 순서와 개수를 바꾸지 않는다.
 */
type SeedUser = {
  sub: string;
  name: string;
  email: string | null;
};

const SEED_USERS: SeedUser[] = [
  {
    sub: "11111111-1111-4111-8111-111111111111",
    name: "홍길동(테스트)",
    email: null,
  },
  {
    sub: "22222222-2222-4222-8222-222222222222",
    name: "김부장(테스트)",
    email: null,
  },
  {
    sub: "33333333-3333-4333-8333-333333333333",
    name: "이과장(테스트)",
    email: null,
  },
  {
    sub: "44444444-4444-4444-8444-444444444444",
    name: "박사원(테스트)",
    email: null,
  },
];

type Seed = {
  topic: "MUST_READ" | "NOTICE" | "GENERAL";
  title: string;
  body: string[];
  /** 오늘로부터 며칠 전에 쓴 글로 둘지 */
  daysAgo: number;
  author: number;
};

const SEEDS: Seed[] = [
  { topic: "MUST_READ", title: "10월 안전교육 필수 이수 안내", body: ["전 직원은 10월 31일까지 안전교육을 이수해 주세요.", "미이수자는 별도로 연락드립니다."], daysAgo: 1, author: 1 },
  { topic: "MUST_READ", title: "주차장 보수 공사 기간 주차 안내", body: ["10월 14일부터 18일까지 지상 주차장을 사용할 수 없습니다.", "건물 뒤편 임시 주차 구역을 이용해 주세요."], daysAgo: 6, author: 2 },
  { topic: "NOTICE", title: "추석 연휴 근무표 공유", body: ["연휴 기간 당직 근무표를 공유합니다.", "변경이 필요하면 팀장에게 알려주세요."], daysAgo: 2, author: 1 },
  { topic: "NOTICE", title: "사내 메신저 점검 (10/12 02:00~04:00)", body: ["해당 시간에는 메신저 접속이 되지 않습니다."], daysAgo: 3, author: 3 },
  { topic: "NOTICE", title: "11월 건강검진 일정 접수", body: ["검진 희망일을 이번 주까지 알려주세요."], daysAgo: 8, author: 2 },
  { topic: "NOTICE", title: "사무용품 신청 방법 변경", body: ["다음 달부터 신청서를 게시판으로 받습니다."], daysAgo: 12, author: 3 },
  { topic: "GENERAL", title: "사무실 커피머신 교체했습니다", body: ["2층 휴게실 커피머신을 새로 들였습니다.", "사용법은 기계 옆에 붙여두었습니다."], daysAgo: 4, author: 0 },
  { topic: "GENERAL", title: "회의실 예약 중복 문의", body: ["오후 2시 대회의실 예약이 겹친 것 같습니다. 확인 부탁드립니다."], daysAgo: 5, author: 3 },
  { topic: "GENERAL", title: "A/S 출장 일정 공유 (10월 2주)", body: ["이번 주 출장 일정입니다.", "변경 사항은 바로 알려드리겠습니다."], daysAgo: 5, author: 2 },
  { topic: "GENERAL", title: "점심 식당 추천 받습니다", body: ["근처 새로 생긴 식당 가보신 분 있나요?"], daysAgo: 7, author: 0 },
  { topic: "GENERAL", title: "프린터 토너 교체 완료", body: ["3층 복합기 토너를 교체했습니다."], daysAgo: 9, author: 3 },
  { topic: "GENERAL", title: "계측기 교정 일정 안내", body: ["이번 달 교정 예정 계측기 목록을 공유합니다."], daysAgo: 10, author: 2 },
  { topic: "GENERAL", title: "사내 체육행사 의견 조사", body: ["11월 중 하루 체육행사를 하려고 합니다.", "참여 가능한 날짜를 알려주세요."], daysAgo: 11, author: 1 },
  { topic: "GENERAL", title: "작업복 추가 신청자 확인", body: ["추가로 필요한 분은 사이즈를 남겨주세요."], daysAgo: 13, author: 2 },
  { topic: "GENERAL", title: "창고 정리 도움 요청", body: ["금요일 오후에 창고 정리를 합니다. 도와주실 분 계신가요?"], daysAgo: 14, author: 3 },
  { topic: "GENERAL", title: "출장 차량 예약 방법", body: ["차량 키는 1층 안내데스크에서 받습니다."], daysAgo: 16, author: 0 },
  { topic: "GENERAL", title: "사내 와이파이 비밀번호 변경", body: ["변경된 비밀번호는 팀장에게 문의해 주세요."], daysAgo: 18, author: 1 },
  { topic: "GENERAL", title: "9월 생산 실적 공유", body: ["9월 실적 요약입니다."], daysAgo: 20, author: 2 },
  { topic: "GENERAL", title: "정수기 필터 교체 예정", body: ["다음 주 화요일에 교체 예정입니다."], daysAgo: 22, author: 3 },
  { topic: "GENERAL", title: "분실물 보관 안내 (검정 우산)", body: ["2층 휴게실에서 검정 우산을 찾았습니다."], daysAgo: 24, author: 0 },
  { topic: "GENERAL", title: "하반기 교육 신청 마감", body: ["신청은 이번 주 금요일까지입니다."], daysAgo: 26, author: 1 },
  { topic: "GENERAL", title: "사무실 에어컨 점검 결과", body: ["점검을 마쳤습니다. 이상 없습니다."], daysAgo: 28, author: 3 },
  { topic: "GENERAL", title: "택배 수령 장소 변경", body: ["앞으로 택배는 1층 안내데스크에서 받습니다."], daysAgo: 31, author: 2 },
  { topic: "GENERAL", title: "회식 장소 투표", body: ["후보 세 곳 중에서 골라주세요."], daysAgo: 34, author: 0 },
  { topic: "GENERAL", title: "작년 자료 보관 위치 문의", body: ["2025년 서류가 어디에 있는지 아시는 분?"], daysAgo: 300, author: 1 },
  { topic: "GENERAL", title: "사내 게시판 사용 의견", body: ["쓰면서 불편한 점 있으면 알려주세요."], daysAgo: 400, author: 0 },
];

async function main() {
  // 이 스크립트는 DB 에 글을 쓴다. 깃발을 켠 개발 DB 에서만 돈다.
  if (process.env.SEED_DEV_ENABLED !== "true") {
    throw new Error(
      "개발 환경(SEED_DEV_ENABLED=true)에서만 가짜 데이터를 넣을 수 있습니다.",
    );
  }

  // .env.local 을 읽은 뒤에 불러와야 DB 주소가 잡힌다
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { webPosts, webUsers } = await import("../src/lib/db/schema");
  const { extractText } = await import("../src/lib/post-content/sanitize");
  const { paragraphsDoc } = await import("../src/lib/post-content/types");

  // 1) 테스트 계정 — 이미 있으면 건드리지 않는다
  await db
    .insert(webUsers)
    .values(
      SEED_USERS.map((u) => ({
        authSub: u.sub,
        displayName: u.name,
        email: u.email,
        role: "MEMBER" as const,
      })),
    )
    .onConflictDoNothing({ target: webUsers.authSub });

  const users = await db
    .select({ id: webUsers.id, authSub: webUsers.authSub })
    .from(webUsers);
  const idBySub = new Map(users.map((u) => [u.authSub, u.id]));

  // 2) 글 — 하나라도 있으면 넣지 않는다
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(webPosts);

  if (count > 0) {
    console.log(`이미 글이 ${count}건 있습니다. 가짜 데이터를 넣지 않습니다.`);
    return;
  }

  const DAY = 24 * 60 * 60 * 1000;
  const rows = SEEDS.map((seed) => {
    const authorSub = SEED_USERS[seed.author].sub;
    const authorId = idBySub.get(authorSub);
    if (!authorId) throw new Error(`테스트 계정을 찾지 못했습니다: ${authorSub}`);

    const content = paragraphsDoc(seed.body);
    const at = new Date(Date.now() - seed.daysAgo * DAY);

    return {
      authorId,
      topic: seed.topic,
      title: seed.title,
      content,
      contentText: extractText(content),
      createdAt: at,
      updatedAt: at,
    };
  });

  await db.insert(webPosts).values(rows);
  console.log(`가짜 글 ${rows.length}건을 넣었습니다. (전부 테스트 데이터입니다)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

// 이 파일을 모듈로 취급하게 한다 (스크립트끼리 전역 이름이 겹치지 않도록)
export {};
