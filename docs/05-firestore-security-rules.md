# Firestore Security Rules

**Status: implemented in `firestore.rules`, 107 emulator tests PASSED (plus 31 integration tests) (2026-10-26). NOT PRODUCTION READY.** Not deployed, not reviewed by the owner, and the known gaps below are open. The code block below is the original draft; `firestore.rules` is authoritative. Owner-approved changes since the draft: `request.time` checks and immutable `createdAt`; direct `get` of own membership document (a missing document returns non-existing, not permission-denied, verified by tests); member `list` limited to members; the collection-group rule is `list` only; a board create must come with the owner membership in the same batch; card `columnId` is immutable; `users/{uid}` readable only by its owner; `displayName` limited to 100 characters (value proposed by Claude, owner approved). Player name (F9): a profile is created with a valid name and `nameSetAt == request.time`, or a legacy profile without `nameSetAt` may be updated once; after that no change; names are 1 to 20 UTF-16 units and not blank; joining and creating a board require a profile with a player name and a member `displayName` equal to it. Session lifecycle (F8): a board is created `waiting`; only the Owner can change `status`, and only `waiting` to `in-progress` (with `startedAt == request.time`) or `in-progress` to `completed` (with `completedAt == request.time`), each changing no other field; rename may not touch `status`; cards can be written only while `in-progress`; a board without `status` counts as `in-progress`.

Run tests: `pnpm test:rules` (Firestore emulator, demo project `demo-retro-room`, no real Firebase project involved). Tests live in `tests/rules/firestore.rules.test.ts`. A mutation check (loosening card and member read to any signed-in user) made 2 tests fail, so the read-denial tests do detect regressions.

Principles: default deny, authenticate every operation, validate fields and types, immutable ownership and roles.

## Permission matrix (Phase 1, from requirements D2 to D7)

| Action | Owner | Member | Signed-in non-member | Signed-out |
| --- | --- | --- | --- | --- |
| Get board document | yes | yes | yes (D2) | no |
| List boards | no | no | no | no |
| Create board (as self-owner) | yes | n/a | yes | no |
| Rename board | yes | no | no | no |
| Change `ownerId` | no | no | no | no |
| Delete board | no (D5) | no | no | no |
| Join (create own member doc, role `member`) | n/a | n/a | yes | no |
| Create member doc with role `owner` | only inside create-board batch | no | only inside create-board batch | no |
| Update or delete member doc | no | no | no | no |
| Read members | yes | yes | no | no |
| Get own membership document (exists or not) | yes | yes | yes | no |
| Collection-group list of own memberships (Dashboard) | yes | yes | yes | no |
| Read cards | yes | yes | no | no |
| Start session (`waiting` to `in-progress`) | yes | no | no | no |
| End session (`in-progress` to `completed`) | yes | no | no | no |
| Restart or reopen a session | no | no | no | no |
| Create card (as self), only while `in-progress` | yes | yes | no | no |
| Edit own card | yes | yes | no | no |
| Edit another user's card | no (D4) | no | no | no |
| Delete own card | yes | yes | no | no |
| Delete another user's card | yes (D4) | no | no | no |
| Create own profile with a valid name, once | yes | yes | yes | no |
| Change the name after it is set | no | no | no | no |
| Read or write own `users/{uid}` | yes | yes | yes | no |
| Read another user's `users` doc | no | no | no | no |

## Draft rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function boardPath(boardId) {
      return /databases/$(database)/documents/boards/$(boardId);
    }
    function memberPath(boardId, uid) {
      return /databases/$(database)/documents/boards/$(boardId)/members/$(uid);
    }
    function isMember(boardId) {
      return signedIn() && exists(memberPath(boardId, request.auth.uid));
    }
    function isOwner(boardId) {
      return isMember(boardId)
        && get(memberPath(boardId, request.auth.uid)).data.role == 'owner';
    }
    function validColumn(columnId) {
      return columnId in ['went-well', 'to-improve', 'ideas'];
    }

    match /users/{uid} {
      allow read: if signedIn();
      allow create, update: if signedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['displayName', 'photoURL', 'createdAt']);
      allow delete: if false;
    }

    match /boards/{boardId} {
      allow get: if signedIn();
      allow list: if false;
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['title', 'ownerId', 'createdAt', 'updatedAt'])
        && request.resource.data.ownerId == request.auth.uid
        && request.resource.data.title is string
        && request.resource.data.title.size() >= 1
        && request.resource.data.title.size() <= 80;
      allow update: if isOwner(boardId)
        && request.resource.data.ownerId == resource.data.ownerId
        && request.resource.data.keys().hasOnly(['title', 'ownerId', 'createdAt', 'updatedAt'])
        && request.resource.data.title is string
        && request.resource.data.title.size() >= 1
        && request.resource.data.title.size() <= 80;
      allow delete: if false;

      match /members/{uid} {
        allow read: if isMember(boardId);
        allow create: if signedIn() && request.auth.uid == uid
          && request.resource.data.keys().hasOnly(['uid', 'role', 'displayName', 'joinedAt'])
          && request.resource.data.uid == uid
          && (
            (request.resource.data.role == 'member' && exists(boardPath(boardId)))
            || (request.resource.data.role == 'owner'
                && !exists(memberPath(boardId, uid))
                && getAfter(boardPath(boardId)).data.ownerId == uid)
          );
        allow update, delete: if false;
      }

      match /cards/{cardId} {
        allow read: if isMember(boardId);
        allow create: if isMember(boardId)
          && request.resource.data.keys().hasOnly(['columnId', 'text', 'authorId', 'createdAt', 'updatedAt'])
          && request.resource.data.authorId == request.auth.uid
          && validColumn(request.resource.data.columnId)
          && request.resource.data.text is string
          && request.resource.data.text.size() >= 1
          && request.resource.data.text.size() <= 500;
        allow update: if isMember(boardId)
          && resource.data.authorId == request.auth.uid
          && request.resource.data.authorId == resource.data.authorId
          && request.resource.data.keys().hasOnly(['columnId', 'text', 'authorId', 'createdAt', 'updatedAt'])
          && validColumn(request.resource.data.columnId)
          && request.resource.data.text is string
          && request.resource.data.text.size() >= 1
          && request.resource.data.text.size() <= 500;
        allow delete: if isMember(boardId)
          && (resource.data.authorId == request.auth.uid || isOwner(boardId));
      }
    }

    match /{path=**}/members/{uid} {
      allow read: if signedIn() && resource.data.uid == request.auth.uid;
    }
  }
}
```

## Deployed rules

The rules currently deployed to the Firebase project have NOT been checked: the Firebase CLI is not logged in. The owner will run `firebase login` and tell Claude. Nothing has been deployed. Compare before any deploy.

## Known gaps to resolve while testing

- The owner-membership branch relies on `getAfter` inside an atomic batch with the board create. Verify it in the Emulator and verify that a lone owner member write is denied.
- Confirm `createdAt` and `joinedAt` are checked against `request.time` where required. Not yet in the draft.
- Confirm the collection-group rule and the nested `members` rule combine as intended (access is the OR of matching rules).
- Confirm `exists(boardPath)` in the join branch cannot be abused to join a deleted or never-created board.
- Concurrent join and duplicate join: second create on an existing doc is an update and is denied.

## Required tests (all PASSED in `tests/rules/firestore.rules.test.ts`)

Allowed: sign-in user creates board with owner membership batch; join as member; member creates, edits, deletes own card; owner deletes another's card; owner renames board.

Denied: signed-out access to everything; board list; non-member reads cards or members; self-join as `owner`; change role or `ownerId`; member edits another's card; member deletes another's card; card over 500 characters; invalid column; extra fields; write `users/{other}`.
