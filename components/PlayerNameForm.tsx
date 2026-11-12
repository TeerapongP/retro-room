"use client";

import { useRef, useState, type FormEvent } from "react";
import { RetroKeyboard } from "@/components/ui/RetroKeyboard";
import { RetroAlert } from "@/components/ui/RetroAlert";
import { removeLastCharacter } from "@/lib/remove-last-character";
import { describeFirebaseError } from "@/lib/firebase/client";
import {
  PLAYER_NAME_MAX_LENGTH,
  isValidPlayerName,
  normalizePlayerName,
} from "@/lib/firebase/types";

const BLANK_NAME_MESSAGE = "กรุณาพิมพ์ชื่อของคุณก่อนกด OK";
const NAME_TOO_LONG_MESSAGE = `ชื่อยาวได้ไม่เกิน ${PLAYER_NAME_MAX_LENGTH} ตัวอักษร`;

type PlayerNameFormProps = {
  onSubmit: (playerName: string) => Promise<void>;
};

/** Renders the dialogue, name field, on-screen keyboard and status panels as direct children of the scene stage. */
export function PlayerNameForm({ onSubmit }: PlayerNameFormProps) {
  const [name, setName] = useState("");
  const latestNameRef = useRef("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const playerName = normalizePlayerName(name);

  function handleNameChange(nextName: string) {
    latestNameRef.current = nextName;
    setName(nextName);
    setValidationError(null);
    setSubmitError(null);
  }

  function appendCharacter(character: string) {
    const currentName = latestNameRef.current;
    if (currentName.length + character.length > PLAYER_NAME_MAX_LENGTH) {
      setValidationError(NAME_TOO_LONG_MESSAGE);
      return;
    }
    handleNameChange(currentName + character);
  }

  function removeCharacter() {
    handleNameChange(removeLastCharacter(latestNameRef.current));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    if (!isValidPlayerName(playerName)) {
      setValidationError(BLANK_NAME_MESSAGE);
      return;
    }
    setIsSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(playerName);
    } catch (error) {
      setSubmitError(describeFirebaseError(error));
      setIsSaving(false);
    }
  }

  const errorMessage = validationError ?? submitError;

  return (
    <form onSubmit={handleSubmit} noValidate className="contents">
      <div className="setup-dialogue pixel-panel">
        <h1 className="font-pixel">Your name?</h1>
      </div>

      <div className="setup-name pixel-panel">
        <label htmlFor="player-name" className="font-pixel">
          Name
        </label>
        <input
          id="player-name"
          ref={nameInputRef}
          className="setup-input font-pixel"
          value={name}
          maxLength={PLAYER_NAME_MAX_LENGTH}
          onChange={(event) => handleNameChange(event.target.value)}
          autoComplete="nickname"
          autoFocus
          spellCheck={false}
          disabled={isSaving}
          aria-invalid={validationError ? true : undefined}
          aria-describedby="player-name-notice"
        />
      </div>

      <RetroKeyboard
        className="setup-keyboard"
        onCharacter={appendCharacter}
        onBackspace={removeCharacter}
        onExit={() => nameInputRef.current?.focus()}
        disabled={isSaving}
        isSaving={isSaving}
      />

      <div className="setup-status pixel-panel">
        {errorMessage ? <RetroAlert>{errorMessage}</RetroAlert> : null}
        <p id="player-name-notice">
          ชื่อนี้จะแสดงให้เพื่อนร่วมทีมเห็นในทุกบอร์ด และแก้ไขภายหลังไม่ได้
          <span className="setup-counter font-pixel">
            {name.length}/{PLAYER_NAME_MAX_LENGTH}
          </span>
        </p>
      </div>
    </form>
  );
}
