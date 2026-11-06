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

### Timer fields on `boards/{boardId}` (F22, D111)

| Field | Type | Notes |
| --- | --- | --- |
| `timerEndsAt` | timestamp or `null` | End of the shared countdown; absent or `null` when no timer runs. Set from the admin's clock, at most 2 hours ahead |
| `timerDurationSec` | integer or `null` | The length it was started with (1 to 7200) |
| `phase` | integer 1 to 6 | F23 (D117). The shared session step; absent means 1. Only the admin changes it |

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
| `hidden` | boolean | F17 (D75, D76). `false` on create; only the admin changes it. A card without this field is readable only by its author and the admin |
| `groupId` | string or `null` | F21 (D102). Cards of one column with the same value form a stack; absent or `null` means not stacked. Only the admin sets it |
| `createdAt` | timestamp | Server timestamp. A moved card gets a new one (D78) |
| `updatedAt` | timestamp | Server timestamp |
| `movedFromBoardId`, `movedFromCardId` | string | Only on a card created by an admin move (D77) |

Anonymous posting is not supported, so author is stored and may be displayed.

## boards/{boardId}/cardMoves/{cardId} (F17, D77)

Ledger of a card moved out of this board. Document ID is the moved card's id. Fields: `destBoardId`, `destCardId`, `movedAt` (server timestamp). Written once by the admin together with the destination card and the source delete; never updated or deleted; readable only by the admin.

## boards/{boardId}/voters/{uid} (F26, D137)

| Field | Type | Notes |
| --- | --- | --- |
| `cardIds` | list of strings | At most 3 distinct card ids (each 1 to 64 characters) the member voted for |
| `updatedAt` | timestamp | Server timestamp |

The document ID is the voter's uid. Counts per card are computed on the client from all voter documents (`lib/votes.ts`).

## Queries and indexes

| Query | Index |
| --- | --- |
| Dashboard: `collectionGroup('members').where('uid','==',uid)` | Collection-group field override on `members.uid` (ascending) |
| Board cards, admin: `cards.orderBy('createdAt')` | Single-field, automatic |
| Board cards, member (D76): `cards.where('hidden','==',false)` and `cards.where('authorId','==',uid)`, merged and sorted on the client | Single-field equality, automatic. No `orderBy`, so no composite index |
| Votes: `boards/{id}/voters` (whole subcollection read) | none |
| Admin move targets: `boards.where('status','==','in-progress')` | Single-field, automatic |
| Board members: `members` subcollection read | none |

Dashboard ordering (O5) is UNCONFIRMED. Proposed: newest `joinedAt` first, which needs a composite collection-group index on `uid` and `joinedAt`.

## Not modeled (Phase 2)

Votes, comments, action items, timer.
