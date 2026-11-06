import type { BoardMember } from "@/lib/firebase/types";
import { RATING_VALUES, averageRating, formatScore, type Rating } from "@/lib/ratings";

type RatingPanelProps = {
  ratings: Rating[];
  members: BoardMember[];
  uid: string;
  onRate: (score: number) => void;
};

/** Step 4 (F28): the board is hidden and each member picks one score from 1 to 5. Everyone sees all scores. */
export function RatingPanel({ ratings, members, uid, onRate }: RatingPanelProps) {
  const myScore = ratings.find((rating) => rating.uid === uid)?.score;
  const average = averageRating(ratings);
  const scoreByUid = new Map(ratings.map((rating) => [rating.uid, rating.score]));

  return (
    <section className="rating-panel pixel-panel" aria-label="ให้คะแนนตัวเอง">
      <div className="rating-scale" role="group" aria-label="เลือกคะแนน">
        {RATING_VALUES.map((score) => {
          const voters = ratings.filter((rating) => rating.score === score).length;
          return (
            <button
              key={score}
              type="button"
              className="rating-choice"
              aria-pressed={myScore === score}
              onClick={() => onRate(score)}
            >
              <span className="rating-choice-score">{formatScore(score)}</span>
              <span className="rating-choice-count">{voters > 0 ? `${voters} คน` : " "}</span>
            </button>
          );
        })}
      </div>
      <p className="rating-average" role="status">
        {average === null ? "ยังไม่มีใครให้คะแนน" : `ค่าเฉลี่ย ${formatScore(average)} จาก ${ratings.length} คน`}
      </p>
      <ul className="rating-people">
        {members.map((member) => {
          const score = scoreByUid.get(member.uid);
          return (
            <li key={member.uid}>
              <span>{member.displayName}</span>
              <strong>{score === undefined ? "ยังไม่ให้" : formatScore(score)}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
