import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../src/core/database/client';
import { scheduleItems } from '../src/modules/student-profile/student-profile.schema';

type Args = {
  apply: boolean;
  dryRun: boolean;
  timezone: string;
  shiftMinutes?: number;
  userId?: string;
};

function parseArgs(argv: string[]): Args {
  const getValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };

  const apply = argv.includes('--apply');
  const dryRun = !apply || argv.includes('--dry-run');
  const timezone = getValue('--timezone') || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const shiftMinutesRaw = getValue('--shift-minutes');
  const userId = getValue('--user-id');

  const shiftMinutes = shiftMinutesRaw !== undefined ? Number(shiftMinutesRaw) : undefined;
  if (shiftMinutesRaw !== undefined && Number.isNaN(shiftMinutes)) {
    throw new Error(`Invalid --shift-minutes value: ${shiftMinutesRaw}`);
  }

  return { apply, dryRun, timezone, shiftMinutes, userId };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  const zonedAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return Math.round((zonedAsUtc - date.getTime()) / 60000);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('[FixClassTimezone] Starting');
  console.log(`[FixClassTimezone] Mode=${args.dryRun ? 'dry-run' : 'apply'}`);
  console.log(`[FixClassTimezone] Timezone=${args.timezone}`);
  if (args.shiftMinutes !== undefined) {
    console.log(`[FixClassTimezone] Forced shift=${args.shiftMinutes} minutes`);
  }
  if (args.userId) {
    console.log(`[FixClassTimezone] Scoped userId=${args.userId}`);
  }

  const where = and(
    eq(scheduleItems.type, 'class'),
    eq(scheduleItems.isRecurring, true),
    or(
      eq(scheduleItems.linkedEntityType, 'section'),
      isNull(scheduleItems.linkedEntityType),
    ),
    args.userId ? eq(scheduleItems.userId, args.userId) : undefined,
  );

  const rows = await db.select().from(scheduleItems).where(where);

  const candidates = rows.filter((row) => {
    const title = (row.title || '').toLowerCase();
    return title.includes('lecture') || title.includes('tutorial') || title.includes('lab');
  });

  const updates = candidates.map((row) => {
    const offset = args.shiftMinutes ?? getTimeZoneOffsetMinutes(row.startDateTime, args.timezone);
    const correctedStart = new Date(row.startDateTime.getTime() - offset * 60000);
    const correctedEnd = new Date(row.endDateTime.getTime() - offset * 60000);
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      offsetAppliedMinutes: offset,
      beforeStart: row.startDateTime.toISOString(),
      afterStart: correctedStart.toISOString(),
      beforeEnd: row.endDateTime.toISOString(),
      afterEnd: correctedEnd.toISOString(),
      correctedStart,
      correctedEnd,
    };
  });

  console.log(`[FixClassTimezone] Candidates=${updates.length}`);
  console.table(
    updates.slice(0, 20).map(({ correctedStart, correctedEnd, ...item }) => item)
  );

  if (args.dryRun) {
    console.log('[FixClassTimezone] Dry run complete. Re-run with --apply to persist.');
    return;
  }

  let updated = 0;
  for (const row of updates) {
    await db
      .update(scheduleItems)
      .set({
        startDateTime: row.correctedStart,
        endDateTime: row.correctedEnd,
        updatedAt: new Date(),
      })
      .where(eq(scheduleItems.id, row.id));
    updated++;
  }

  console.log(`[FixClassTimezone] Updated rows=${updated}`);
}

main().catch((error) => {
  console.error('[FixClassTimezone] Failed:', error);
  process.exit(1);
});
