-- The content plan and its to-do list became shared across the agency, so every staff
-- login gets the `content` permission. Idempotent: re-running adds nothing.
-- Client portal logins are deliberately excluded — they must never see the work list.
UPDATE "User"
   SET permissions = array_append(permissions, 'content')
 WHERE role <> 'CLIENT'
   AND NOT ('content' = ANY(permissions));
