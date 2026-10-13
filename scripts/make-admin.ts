/**
 * 관리자 지정 **비상구**.   npm run make:admin -- <이름 또는 auth_sub>
 *
 * 평소에는 이 스크립트를 쓰지 않는다. 역할은 통합 로그인 포털(dss-auth)이
 * 정하고, 포털이 ID 토큰에 실어 보낸 role 을 로그인할 때마다 반영한다
 * (src/lib/auth/provision.ts). /admin/users 화면에서는 역할을 바꿀 수 없다.
 *
 * 이 스크립트는 **포털 쪽이 막혔을 때** 쓰는 길이다 — 포털에 아직 이 게시판의
 * 역할을 넣지 못했거나, 포털이 내려가 있어 아무도 관리 화면에 못 들어갈 때.
 *
 * ⚠️ 여기서 올린 역할은 영구적이지 않다. 포털이 그 사람에게 다른 역할을 실어
 * 보내면 다음 로그인에 그 값으로 덮인다. 오래 갈 변경은 포털에서 해야 한다.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // 운영 컨테이너에는 이 파일이 없다. 그때는 DATABASE_URL 이 환경변수로 들어온다.
  // 감싸지 않으면 ENOENT 로 여기서 죽는다 — 비상구가 정작 급할 때 안 열린다.
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    throw new Error(
      '사용법: npm run make:admin -- "홍길동"   (이름 또는 auth_sub)',
    );
  }

  // .env.local 을 읽은 뒤에 불러와야 DB 주소가 잡힌다
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { webUsers } = await import("../src/lib/db/schema");
  const { writeAudit } = await import("../src/lib/audit");

  const where = UUID_RE.test(arg)
    ? eq(webUsers.authSub, arg)
    : eq(webUsers.displayName, arg);

  const found = await db.select().from(webUsers).where(where);

  if (found.length === 0) {
    console.error(
      `'${arg}' 에 해당하는 계정이 없습니다.\n` +
        "먼저 그 사람이 한 번 로그인해야 계정이 만들어집니다.",
    );
    process.exitCode = 1;
    return;
  }
  if (found.length > 1) {
    console.error(
      `'${arg}' 로 찾은 계정이 ${found.length}개입니다. auth_sub 로 지정해 주세요:`,
    );
    for (const u of found) console.error(`  ${u.authSub}  ${u.displayName}`);
    process.exitCode = 1;
    return;
  }

  const user = found[0];
  if (user.role === "ADMIN") {
    console.log(`${user.displayName} 은(는) 이미 관리자입니다.`);
    return;
  }

  await db
    .update(webUsers)
    .set({ role: "ADMIN", updatedAt: new Date() })
    .where(eq(webUsers.id, user.id));

  await writeAudit({
    actorId: user.id,
    action: "ROLE_CHANGE",
    targetType: "USER",
    targetId: user.id,
    detail: { from: user.role, to: "ADMIN", by: "make-admin script" },
  });

  console.log(`${user.displayName} 을(를) 관리자로 지정했습니다.`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

// 이 파일을 모듈로 취급하게 한다 (스크립트끼리 전역 이름이 겹치지 않도록)
export {};
