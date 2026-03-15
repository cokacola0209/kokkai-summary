// src/jobs/fetch-meetings.ts
/**
 * 前日分の会議録を NDL API から取得して DB に保存するバッチジョブ。
 *
 * 使用方法:
 *   npx tsx src/jobs/fetch-meetings.ts            # 前日
 *   npx tsx src/jobs/fetch-meetings.ts 2024-05-01 # 指定日
 *
 * cron 例 (毎朝 5:00 JST):
 *   0 20 * * * cd /path/to/project && npx tsx src/jobs/fetch-meetings.ts >> logs/fetch.log 2>&1
 */

import { prisma } from "@/lib/prisma";
import { fetchMeetingsByDate } from "@/lib/ndl/client";
import { generateSummary } from "@/lib/summarizer";
import type { NdlMeetingRecord, NdlSpeechRecord } from "@/types/ndl";

// ──────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────

function getTargetDate(arg?: string): string {
  if (arg) return arg;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

async function upsertMeeting(record: NdlMeetingRecord): Promise<string> {
  const meeting = await prisma.meeting.upsert({
    where: { ndlId: record.issueID },
    create: {
      ndlId: record.issueID,
      date: new Date(record.date),
      house: record.nameOfHouse,
      nameOfMeeting: record.nameOfMeeting,
      issue: record.issue || null,
      url: record.meetingURL,
      rawJson: record as object,
    },
    update: {
      rawJson: record as object,
      updatedAt: new Date(),
    },
  });
  return meeting.id;
}

async function upsertSpeeches(
  meetingId: string,
  speeches: NdlSpeechRecord[]
): Promise<void> {
  // 既存削除 → 再挿入 (シンプルな冪等戦略)
  await prisma.speech.deleteMany({ where: { meetingId } });

  const data = speeches
    .filter((s) => s.speech && s.speech.trim().length > 0)
    .map((s) => ({
      meetingId,
      speaker: s.speaker || "不明",
      speakerGroup: s.speakerGroup || null,
      order: s.speechOrder,
      text: s.speech,
    }));

  if (data.length > 0) {
    await prisma.speech.createMany({ data });
  }
}

// ──────────────────────────────────────────
// メイン
// ──────────────────────────────────────────

async function main() {
  const targetDate = getTargetDate(process.argv[2]);
  console.log(`\n========================================`);
  console.log(`[Fetch Job] Target date: ${targetDate}`);
  console.log(`========================================\n`);

  const errors: string[] = [];
  let fetched = 0;

  try {
    const records = await fetchMeetingsByDate({ date: targetDate });

    for (const record of records) {
      try {
        console.log(
          `\n[Job] Processing: ${record.nameOfHouse} ${record.nameOfMeeting} (${record.issueID})`
        );

        // 1. Meeting + Speech 保存
        const meetingId = await upsertMeeting(record);
        await upsertSpeeches(meetingId, record.speechRecord ?? []);
        fetched++;

        // 2. 要約生成 (既存サマリがなければ生成)
        const existingSummary = await prisma.summary.findUnique({
          where: { meetingId },
        });
        if (!existingSummary) {
          console.log(`[Job] Generating summary for ${meetingId}...`);
          try {
            await generateSummary(meetingId);
            console.log(`[Job] Summary generated for ${meetingId}`);
          } catch (summaryErr) {
            console.error(`[Job] Summary failed for ${meetingId}:`, summaryErr);
            errors.push(`summary:${meetingId}: ${String(summaryErr)}`);
          }
        } else {
          console.log(`[Job] Summary already exists for ${meetingId}, skipping.`);
        }
      } catch (recordErr) {
        console.error(`[Job] Failed for ${record.issueID}:`, recordErr);
        errors.push(`record:${record.issueID}: ${String(recordErr)}`);
      }
    }

    // 3. ログ保存
    await prisma.fetchLog.create({
      data: {
        date: new Date(targetDate),
        status: errors.length === 0 ? "success" : fetched > 0 ? "partial" : "error",
        fetched,
        errors,
      },
    });

    console.log(`\n[Job] Completed. fetched=${fetched}, errors=${errors.length}`);
  } catch (err) {
    console.error("[Job] Fatal error:", err);
    await prisma.fetchLog.create({
      data: {
        date: new Date(targetDate),
        status: "error",
        fetched,
        errors: [String(err)],
      },
    });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
