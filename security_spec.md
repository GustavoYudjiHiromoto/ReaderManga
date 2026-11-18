# Security Specification: MangaReader Cloud Sync

## 1. Data Invariants
1. **User Isolation**: A user can only access, create, mutate, or query documents strictly rooted under `/users/$(request.auth.uid)`.
2. **Immutable Identity**: `userId` in path must match `request.auth.uid`. A user cannot forge ownership of another user's library.
3. **No Cross-User List Leakage**: Every `allow list` evaluates `userId == request.auth.uid`. Blanket list operations (`allow list: if isSignedIn()`) are prohibited.
4. **Field Boundaries & Types**: All incoming document fields must be bounded in length, follow designated data types, and contain no rogue/shadow keys.
5. **No Unauthenticated Access**: Default-deny on all documents `match /{document=**} { allow read, write: if false; }`.

## 2. The "Dirty Dozen" Threat Payloads
1. **Payload 1 (Ghost Field / Shadow Key)**: A write to `/users/{userId}/favorites/{favId}` containing an unauthorized `isAdmin: true` attribute. Must be rejected.
2. **Payload 2 (Cross-User Write)**: User A (`uid_A`) attempts to write to `/users/uid_B/favorites/fav1`. Must be rejected with PERMISSION_DENIED.
3. **Payload 3 (Unauthenticated Read)**: An unauthenticated guest attempts to read `/users/uid_A/library/sync`. Must be rejected.
4. **Payload 4 (Identity Spoofing)**: User A creates a profile under `/users/uid_A` with `uid: "uid_B"`. Must be rejected due to identity mismatch with `request.auth.uid`.
5. **Payload 5 (Huge String / Resource Poisoning)**: An attacker submits a manga title or note of 200KB to `/users/{userId}/favorites/{favId}`. Must fail `.size() <= max` validation.
6. **Payload 6 (Oversized Array Injection)**: An attacker injects 10,000 tags into `customCollections`. Must fail `.size() <= 50` limit.
7. **Payload 7 (Invalid Document ID)**: An attacker attempts to write to `/users/{userId}/favorites/invalid$$doc%%id`. Must fail `isValidId()` check.
8. **Payload 8 (Invalid Enum Value)**: User passes `userCategory: "super_vip"` instead of `reading|completed|plan_to_read|on_hold|dropped`. Must be rejected.
9. **Payload 9 (Negative Reading Time)**: User passes `totalSecondsSpent: -9999`. Must be rejected.
10. **Payload 10 (Type Poisoning on Score)**: User passes `userScore: "ten"` as a string instead of number. Must fail `data.userScore is number`.
11. **Payload 11 (Blanket Collection Scraping)**: A user issues a query for `/users` root documents. Rejected by default-deny.
12. **Payload 12 (Subcollection Bypass)**: An attacker attempts to read `/users/{otherUser}/history`. Rejected because path variable does not match `request.auth.uid`.

## 3. Feedback & Admin Triage Security Invariants (`/feedback/{feedbackId}`)
1. **Verified Author Ownership**: Creating a document in `/feedback/{feedbackId}` requires `request.auth != null && request.auth.token.email_verified == true`, `incoming().authorUid == request.auth.uid`, `incoming().id == feedbackId`, and `incoming().status == 'open'`.
2. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation; on update, `createdAt == existing().createdAt` and `updatedAt == request.time`.
3. **Strict List & PII Isolation**: `allow get` and `allow list` on `/feedback` restrict `resource.data.authorUid == request.auth.uid` for standard users, or `isAdmin()` (`email == 'natsugustavo@gmail.com' && email_verified == true`). Non-admins can never scrape other users' feedback or `authorEmail`.
4. **Tiered Action-Based Updates**:
   - Standard authors can only edit `['type', 'title', 'description', 'contextUrl', 'mangaContext', 'updatedAt']` while `existing().status == 'open' && incoming().status == 'open'`.
   - Admin can only mutate `['status', 'adminNotes', 'updatedAt']`.
   - `adminNotes` is forbidden on initial creation.

## 4. Feedback Adversarial Payloads ("Dirty Dozen" Extension)
1. **Unverified Admin Spoof**: Token with `email: 'natsugustavo@gmail.com'` and `email_verified: false` attempts `list` on `/feedback`. Must be rejected.
2. **Pre-Triaged / Self-Resolved Create**: User creates feedback with `status: 'resolved'` or `adminNotes: 'approved'`. Must be rejected.
3. **Author Spoofing**: User A creates feedback with `authorUid: 'uid_B'` or `authorEmail: 'victim@example.com'`. Must be rejected.
4. **Cross-User Feedback Read/List**: User A queries `/feedback` without filtering `authorUid == uid_A` or tries `get /feedback/{otherId}`. Must be rejected.
5. **Client Timestamp Forgery**: User submits `createdAt` or `updatedAt` different from `request.time`. Must be rejected.
6. **Non-Admin Triage Escalation**: Author updates own feedback changing `status` to `'resolved'` or adding `adminNotes`. Must be rejected.
7. **Post-Triage Mutation**: Author attempts to edit `title` or `description` after admin moved `status` to `'in_progress'` or `'resolved'`. Must be rejected.
8. **Payload Poisoning**: User submits a 10KB `description` (> 2000 chars) or 2-char `title` (< 3 chars) or invalid `type: 'spam'`. Must be rejected.

