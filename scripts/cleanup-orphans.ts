/**
 * 주인 없는 사진·첨부 정리.   npm run cleanup:orphans
 *
 * 글을 저장하지 않고 창을 닫으면 post_id 가 빈 파일이 남는다.
 * 24시간이 지난 미연결 파일을 디스크에서 치우고 DB 행은 소프트 삭제한다.
 * (물리 삭제는 하지 않는다 — 9절 규칙)
 *
 * PowerShell 이 아니라 TypeScript 다. NAS 의 Linux 컨테이너에서도 그대로 돈다.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // 운영 컨테이너에는 이 파일이 없다. 그때는 DATABASE_URL 이 환경변수로 들어온다.
}

const HOURS = Number(process.argv[2] ?? "24");

async function main() {
  if (!Number.isFinite(HOURS) || HOURS < 1) {
    throw new Error("사용법: npm run cleanup:orphans -- [몇시간_지난것]");
  }

  const { and, eq, isNull, lt } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db");
  const { webPostFiles, webPostImages } = await import("../src/lib/db/schema");
  const { removeUpload } = await import("../src/lib/uploads/storage");

  const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000);
  const now = new Date();
  let removed = 0;

  for (const table of [webPostImages, webPostFiles] as const) {
    const orphans = await db
      .select({ id: table.id, storagePath: table.storagePath })
      .from(table)
      .where(
        and(
          isNull(table.postId),
          eq(table.isDeleted, false),
          lt(table.createdAt, cutoff),
        ),
      );

    for (const row of orphans) {
      // 파일을 먼저 치우고 DB 를 고친다
      await removeUpload(row.storagePath);
      await db
        .update(table)
        .set({
          isDeleted: true,
          deletedAt: now,
          deleteReason: `${HOURS}시간 동안 글에 붙지 않은 파일`,
        })
        .where(eq(table.id, row.id));
      removed += 1;
    }
  }

  console.log(
    removed === 0
      ? "치울 파일이 없습니다."
      : `주인 없는 파일 ${removed}개를 치웠습니다.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

// 이 파일을 모듈로 취급하게 한다 (스크립트끼리 전역 이름이 겹치지 않도록)
export {};
