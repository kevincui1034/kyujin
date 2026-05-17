ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "match_key" text;--> statement-breakpoint

-- Backfill match_key with the JS classifier's normalized form:
--   lower → replace non-alphanumerics with space → collapse whitespace → trim
-- Joined by '|' so (Cisco, NULL) and (cisco, '') collide deterministically.
UPDATE "applications" SET "match_key" = (
  trim(regexp_replace(regexp_replace(lower(coalesce("company", '')), '[^a-z0-9 ]+', ' ', 'g'), ' +', ' ', 'g'))
  || '|' ||
  trim(regexp_replace(regexp_replace(lower(coalesce("role", '')), '[^a-z0-9 ]+', ' ', 'g'), ' +', ' ', 'g'))
) WHERE "match_key" IS NULL;--> statement-breakpoint

-- ── Dedup existing duplicates so the UNIQUE index below can be created ──
-- For each (user_id, match_key) collision group, pick the row with the most
-- recent last_event_at as the keeper. Promote the keeper's status to the
-- strongest across the group, expand its date window to (MIN first_seen,
-- MAX last_event), re-point losers' emails to the keeper, then delete the
-- losers. Idempotent and safe to re-run.

-- 1. Bump every row's status to the strongest its group has seen. (We delete
--    losers afterward, so updating their rows is harmless.) Status precedence
--    matches the JS strongerStatus(): rejected > accepted > interview > applied.
UPDATE "applications" a
SET "status" = winner.status
FROM (
  SELECT DISTINCT ON (user_id, match_key)
    user_id, match_key, status
  FROM "applications"
  WHERE match_key IS NOT NULL
  ORDER BY user_id, match_key,
    array_position(
      ARRAY['applied','no_response','interview','rejected','accepted','obtained']::application_status[],
      status
    ) DESC
) winner
WHERE a.user_id = winner.user_id
  AND a.match_key = winner.match_key
  AND a.match_key IS NOT NULL;--> statement-breakpoint

-- 2. Widen first_seen_at / last_event_at across the group.
UPDATE "applications" a
SET "first_seen_at" = grp.min_first, "last_event_at" = grp.max_last
FROM (
  SELECT user_id, match_key,
    MIN(first_seen_at) AS min_first,
    MAX(last_event_at) AS max_last
  FROM "applications"
  WHERE match_key IS NOT NULL
  GROUP BY user_id, match_key
) grp
WHERE a.user_id = grp.user_id AND a.match_key = grp.match_key;--> statement-breakpoint

-- 3. Re-point losers' emails to the keeper.
WITH ranked AS (
  SELECT id, user_id, match_key,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, match_key
      ORDER BY last_event_at DESC, created_at DESC, id ASC
    ) AS rn
  FROM "applications"
  WHERE match_key IS NOT NULL
),
keepers AS (
  SELECT user_id, match_key, id AS keeper_id FROM ranked WHERE rn = 1
)
UPDATE "email_messages" em
SET "application_id" = k.keeper_id
FROM ranked r
JOIN keepers k ON r.user_id = k.user_id AND r.match_key = k.match_key
WHERE r.rn > 1 AND em.application_id = r.id;--> statement-breakpoint

-- 4. Delete the loser rows.
DELETE FROM "applications" WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, match_key
      ORDER BY last_event_at DESC, created_at DESC, id ASC
    ) AS rn
    FROM "applications"
    WHERE match_key IS NOT NULL
  ) sub WHERE rn > 1
);--> statement-breakpoint

-- 5. With the table deduplicated the unique index can finally land.
CREATE UNIQUE INDEX IF NOT EXISTS "applications_user_match_key_unique" ON "applications" USING btree ("user_id","match_key");
