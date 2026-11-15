import type { KeyboardEvent } from "react";

// The Enter that confirms an IME composition (Japanese, Chinese, Korean...) is not the user's Enter: it picks the
// word. isComposing says so; keyCode 229 catches Safari, which can end the composition before the keydown runs.
export const composing = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
