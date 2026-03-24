-- Rebuild trip memberships so participant counts match trip ownership rules.
-- 1) Ensure every trip creator exists in trip_members as OWNER.
-- 2) Normalize creator role to OWNER.
-- 3) Normalize non-creator empty/owner role to MEMBER.

WITH missing_creator_members AS (
    SELECT
        (
            substr(member_key, 1, 8) || '-' ||
            substr(member_key, 9, 4) || '-' ||
            '4' || substr(member_key, 14, 3) || '-' ||
            'a' || substr(member_key, 18, 3) || '-' ||
            substr(member_key, 21, 12)
        )::UUID AS id,
        trip_id,
        user_id,
        joined_at
    FROM (
        SELECT
            md5(t.id::TEXT || ':' || t.created_by_user_id::TEXT || ':owner') AS member_key,
            t.id AS trip_id,
            t.created_by_user_id AS user_id,
            COALESCE(t.created_at, NOW()) AS joined_at
        FROM trips t
        LEFT JOIN trip_members tm
               ON tm.trip_id = t.id
              AND tm.user_id = t.created_by_user_id
        WHERE tm.id IS NULL
    ) src
)
INSERT INTO trip_members (id, trip_id, user_id, role, joined_at)
SELECT
    id,
    trip_id,
    user_id,
    'OWNER',
    joined_at
FROM missing_creator_members
ON CONFLICT DO NOTHING;

UPDATE trip_members tm
SET role = 'OWNER'
FROM trips t
WHERE tm.trip_id = t.id
  AND tm.user_id = t.created_by_user_id
  AND tm.role IS DISTINCT FROM 'OWNER';

UPDATE trip_members tm
SET role = 'MEMBER'
FROM trips t
WHERE tm.trip_id = t.id
  AND tm.user_id <> t.created_by_user_id
  AND (
      tm.role IS NULL
      OR btrim(tm.role) = ''
      OR upper(btrim(tm.role)) = 'OWNER'
  );
