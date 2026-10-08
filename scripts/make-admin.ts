/**
 * 첫 관리자 지정.   npm run make:admin -- <이름 또는 auth_sub>
 *
 * 처음 로그인하는 사람은 모두 MEMBER 로 들어온다 (설계상 의도).
 * 그래서 관리자 한 명은 사람이 직접 지정해야 한다. 그 이후부터는
 * 관리자가 /admin/users 화면에서 다른 사람을 승격시킬 수 있다.
 */
process.loadEnvFile(".env.local");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    throw new Error(
      '사용법: npm run make:admin -- "이남준"   (이름 또는 auth_sub)',
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
