import { A } from "./dict-a";
import { B } from "./dict-b";
import { C } from "./dict-c";
import { D } from "./dict-d";

// [en, fa, ru, de]
export const DICT: Record<string, [string, string, string, string]> = { ...A, ...B, ...C, ...D };
