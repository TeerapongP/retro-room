# Firestore Data Model

Phase 1 only. Derived from `01-project-requirements.md` (D1 to D8). Status: PROPOSED, approved in principle with default answers.

## Collections

```
users/{uid}
boards/{boardId}
boards/{boardId}/members/{uid}
boards/{boardId}/cards/{cardId}
```

`boardId` and `cardId` are Firestore auto-IDs. The `boardId` appears in the shared URL `/boards/{boardId}`.

## users/{uid}

| Field | Type | Notes |
| --- | --- | --- |
| `displayName` | string | The player name (D22 to D24), 1 to 20 UTF-16 units |
| `photoURL` | string or null | From Google profile |
| `createdAt` | timestamp | Server timestamp |
| `nameSetAt` | timestamp | Server time the player name was chosen. Missing means the player has not chosen yet (D25) |

Email is not stored (D8). Readable and writable only by the user with that `uid`. The name can be set once, then it is immutable.

## boards/{boardId}

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | 1 to 80 characters. Owner may rename (D5) |
| `ownerId` | string | Creator uid. Immutable (D7) |
| `status` | `'waiting'` or `'in-progress'` or `'completed'` | D13. Set to `waiting` on create. Missing means `in-progress` (D18) |
| `startedAt` | timestamp, optional | Server time when the Owner started |
| `completedAt` | timestamp, optional | Server time when the Owner ended |
| `createdAt` | timestamp | Server timestamp |
| `updatedAt` | timestamp | Server timestamp |

Columns are fixed in the client (D1): `went-well`, `to-improve`, `ideas`. They are not stored on the Board.

## boards/{boardId}/members/{uid}

| Field | Type | Notes |
| --- | --- | --- |
| `uid` | string | Equals document ID. Needed for collection-group query |
| `role` | `'owner'` or `'member'` | Immutable (D7) |
| `displayName` | string | Snapshot of the player name. Rules require it to equal `users/{uid}.displayName` (D26) |
| `joinedAt` | timestamp | Server timestamp |

## boards/{boardId}/cards/{cardId}

| Field | Type | Notes |
| --- | --- | --- |
| `columnId` | `'went-well'` or `'to-improve'` or `'ideas'` | Fixed set (D1) |
| `text` | string | 1 to 500 characters (D3) |
| `authorId` | string | Creator uid. Immutable |
| `createdAt` | timestamp | Server timestamp |
| `updatedAt` | timestamp | Server timestamp |

Anonymous posting is not supported, so author is stored and may be displayed.

## Queries and indexes

| Query | Index |
| --- | --- |
| Dashboard: `collectionGroup('members').where('uid','==',uid)` | Collection-group field override on `members.uid` (ascending) |
| Board cards: `cards.orderBy('createdAt')` | Single-field, automatic |
| Board members: `members` subcollection read | none |

Dashboard ordering (O5) is UNCONFIRMED. Proposed: newest `joinedAt` first, which needs a composite collection-group index on `uid` and `joinedAt`.

## Not modeled (Phase 2)

Votes, comments, action items, timer.
